import logging
from dataclasses import dataclass
from datetime import datetime

from django.db import IntegrityError, transaction
from django.utils import timezone

from transfers.exceptions import InvalidTransition, WebhookEventConflict
from transfers.models import Transfer, TransferActivity, WebhookEvent
from transfers.serializers import ProviderWebhookSerializer
from transfers.services import complete_transfer, fail_transfer


logger = logging.getLogger(__name__)


EVENT_STATUS_MAP = {
    ProviderWebhookSerializer.Event.COMPLETED: WebhookEvent.ProviderStatus.COMPLETED,
    ProviderWebhookSerializer.Event.FAILED: WebhookEvent.ProviderStatus.FAILED,
}


@dataclass(frozen=True)
class WebhookProcessingResult:
    event: WebhookEvent
    duplicate: bool = False


def _event_data_matches(
    event: WebhookEvent,
    *,
    provider_transfer_id: str,
    provider_status: str,
    occurred_at: datetime,
) -> bool:
    return (
        event.provider_transfer_id == provider_transfer_id
        and event.provider_status == provider_status
        and event.occurred_at == occurred_at
    )


@transaction.atomic
def process_provider_webhook(
    *,
    event_id: str,
    event: str,
    occurred_at: datetime,
    data: dict,
) -> WebhookProcessingResult:
    provider_transfer_id = data["provider_transfer_id"]
    provider_status = EVENT_STATUS_MAP[event]

    try:
        with transaction.atomic():
            webhook_event = WebhookEvent.objects.create(
                event_id=event_id,
                provider_transfer_id=provider_transfer_id,
                provider_status=provider_status,
                occurred_at=occurred_at,
            )
        created = True
    except IntegrityError:
        webhook_event = (
            WebhookEvent.objects.select_for_update().get(event_id=event_id)
        )
        created = False

    if not created:
        if not _event_data_matches(
            webhook_event,
            provider_transfer_id=provider_transfer_id,
            provider_status=provider_status,
            occurred_at=occurred_at,
        ):
            logger.warning(
                "Provider webhook event ID reused with different event data",
                extra={
                    "event": "webhook.conflict",
                    "event_id": event_id,
                    "provider_event": event,
                },
            )
            raise WebhookEventConflict(
                "Event ID was already used with different event data"
            )

        logger.info(
            "Duplicate provider webhook delivery",
            extra={
                "event": "webhook.duplicate",
                "event_id": event_id,
                "provider_event": event,
                "processing_outcome": webhook_event.processing_outcome,
            },
        )
        return WebhookProcessingResult(event=webhook_event, duplicate=True)

    try:
        transfer = Transfer.objects.get(
            provider_transfer_id=provider_transfer_id,
        )
    except Transfer.DoesNotExist:
        webhook_event.processing_outcome = (
            WebhookEvent.ProcessingOutcome.UNKNOWN_TRANSFER
        )
        webhook_event.error_message = (
            "No transfer matches the provider transfer ID"
        )
        webhook_event.processed_at = timezone.now()
        webhook_event.save(
            update_fields=[
                "processing_outcome",
                "error_message",
                "processed_at",
            ]
        )
        logger.warning(
            "Provider webhook references an unknown transfer",
            extra={
                "event": "webhook.unknown_transfer",
                "event_id": event_id,
                "provider_event": event,
                "provider_transfer_id": provider_transfer_id,
                "processing_outcome": webhook_event.processing_outcome,
            },
        )
        return WebhookProcessingResult(event=webhook_event)

    webhook_event.transfer = transfer

    try:
        if event == ProviderWebhookSerializer.Event.COMPLETED:
            complete_transfer(
                transfer.pk,
                source=TransferActivity.Source.PROVIDER,
                provider_event=webhook_event,
            )
        else:
            fail_transfer(
                transfer.pk,
                source=TransferActivity.Source.PROVIDER,
                provider_event=webhook_event,
            )
    except InvalidTransition as exc:
        transfer.refresh_from_db(fields=["status"])
        webhook_event.processing_outcome = (
            WebhookEvent.ProcessingOutcome.INVALID_TRANSITION
        )
        webhook_event.error_message = str(exc)
        logger.warning(
            "Provider webhook requested an invalid transfer transition",
            extra={
                "event": "webhook.invalid_transition",
                "event_id": event_id,
                "provider_event": event,
                "transfer_id": str(transfer.pk),
                "transfer_ref": transfer.reference,
                "previous_status": transfer.status,
                "requested_status": provider_status,
                "processing_outcome": webhook_event.processing_outcome,
            },
        )
    else:
        webhook_event.processing_outcome = WebhookEvent.ProcessingOutcome.PROCESSED

    webhook_event.processed_at = timezone.now()
    webhook_event.save(
        update_fields=[
            "transfer",
            "processing_outcome",
            "error_message",
            "processed_at",
        ]
    )

    if webhook_event.processing_outcome == WebhookEvent.ProcessingOutcome.PROCESSED:
        log_context = {
            "event": "webhook.processed",
            "event_id": event_id,
            "provider_event": event,
            "provider_transfer_id": provider_transfer_id,
            "transfer_id": str(transfer.pk),
            "transfer_ref": transfer.reference,
            "processing_outcome": webhook_event.processing_outcome,
        }
        transaction.on_commit(
            lambda: logger.info(
                "Provider webhook transition processed",
                extra=log_context,
            )
        )

    return WebhookProcessingResult(event=webhook_event)
