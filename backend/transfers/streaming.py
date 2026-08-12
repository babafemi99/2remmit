import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

from django.core.serializers.json import DjangoJSONEncoder
from django.http import JsonResponse, StreamingHttpResponse

from transfers.activity_notifications import activity_notifier
from transfers.models import Transfer, TransferActivity
from transfers.serializers import TransferActivitySerializer


HEARTBEAT_INTERVAL_SECONDS = 15
REPLAY_BATCH_SIZE = 100


def _resolve_cursor(request) -> int:
    raw_cursor = request.headers.get("Last-Event-ID")
    if raw_cursor is None:
        raw_cursor = request.GET.get("after", "0")

    try:
        cursor = int(raw_cursor)
    except (TypeError, ValueError) as exc:
        raise ValueError("Activity cursor must be a non-negative integer") from exc

    if cursor < 0:
        raise ValueError("Activity cursor must be a non-negative integer")
    return cursor


async def _activities_after(
    transfer_id: UUID,
    cursor: int,
) -> list[TransferActivity]:
    queryset = (
        TransferActivity.objects
        .filter(transfer_id=transfer_id, id__gt=cursor)
        .select_related("provider_event")
        .order_by("id")[:REPLAY_BATCH_SIZE]
    )
    return [activity async for activity in queryset]


def _format_activity(transfer_id: UUID, activity: TransferActivity) -> str:
    data = {
        "transfer_id": str(transfer_id),
        **TransferActivitySerializer(activity).data,
    }
    encoded = json.dumps(
        data,
        cls=DjangoJSONEncoder,
        separators=(",", ":"),
    )
    return f"id: {activity.pk}\nevent: transfer.activity\ndata: {encoded}\n\n"


async def _activity_stream(
    transfer_id: UUID,
    cursor: int,
) -> AsyncIterator[str]:
    subscription = activity_notifier.subscribe(transfer_id)
    try:
        while True:
            while True:
                activities = await _activities_after(transfer_id, cursor)
                if not activities:
                    break
                for activity in activities:
                    cursor = activity.pk
                    yield _format_activity(transfer_id, activity)

            try:
                await asyncio.wait_for(
                    subscription.event.wait(),
                    timeout=HEARTBEAT_INTERVAL_SECONDS,
                )
            except TimeoutError:
                yield ": keepalive\n\n"
            else:
                subscription.event.clear()
    except asyncio.CancelledError:
        raise
    finally:
        activity_notifier.unsubscribe(subscription)


async def transfer_activity_stream(request, transfer_id):
    if not await Transfer.objects.filter(pk=transfer_id).aexists():
        return JsonResponse({"detail": "Transfer not found"}, status=404)

    try:
        cursor = _resolve_cursor(request)
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    response = StreamingHttpResponse(
        _activity_stream(transfer_id, cursor),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
