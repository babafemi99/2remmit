import asyncio
import json
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from asgiref.sync import sync_to_async
from django.test import AsyncClient, TransactionTestCase
from django.urls import reverse

from transfers.activity_notifications import activity_notifier
from transfers.models import Transfer, TransferActivity
from transfers.services import create_transfer, submit_transfer


def parse_sse_data(chunk):
    text = chunk.decode() if isinstance(chunk, bytes) else chunk
    data_line = next(line for line in text.splitlines() if line.startswith("data: "))
    return text, json.loads(data_line.removeprefix("data: "))


async def disconnect_stream(iterator):
    pending = asyncio.create_task(anext(iterator))
    await asyncio.sleep(0)
    pending.cancel()
    try:
        await pending
    except asyncio.CancelledError:
        pass


class TransferActivityStreamTests(TransactionTestCase):
    def setUp(self):
        self.client = AsyncClient()
        self.transfer = create_transfer(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
        )
        self.url = reverse(
            "transfer-activity-stream",
            kwargs={"transfer_id": self.transfer.pk},
        )

    async def open_stream(self, url=None, **extra):
        return await self.client.get(url or self.url, **extra)

    async def test_headers_and_initial_replay(self):
        response = await self.open_stream()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/event-stream")
        self.assertEqual(response["Cache-Control"], "no-cache")
        self.assertEqual(response["X-Accel-Buffering"], "no")

        iterator = response.streaming_content.__aiter__()
        chunk = await asyncio.wait_for(anext(iterator), timeout=1)
        text, data = parse_sse_data(chunk)
        self.assertIn("event: transfer.activity", text)
        self.assertEqual(data["type"], TransferActivity.Type.CREATED)
        self.assertEqual(data["transfer_id"], str(self.transfer.pk))
        await disconnect_stream(iterator)
        self.assertEqual(activity_notifier.subscriber_count(self.transfer.pk), 0)

    async def test_after_cursor_waits_then_receives_committed_activity(self):
        cursor = await self.transfer.activities.values_list("id", flat=True).aget()
        response = await self.open_stream(f"{self.url}?after={cursor}")
        iterator = response.streaming_content.__aiter__()
        next_chunk = asyncio.create_task(anext(iterator))

        for _ in range(20):
            if activity_notifier.subscriber_count(self.transfer.pk):
                break
            await asyncio.sleep(0)
        self.assertEqual(activity_notifier.subscriber_count(self.transfer.pk), 1)

        await sync_to_async(submit_transfer, thread_sensitive=True)(self.transfer.pk)
        chunk = await asyncio.wait_for(next_chunk, timeout=1)
        _, data = parse_sse_data(chunk)
        self.assertEqual(data["type"], TransferActivity.Type.SUBMITTED)
        self.assertEqual(data["previous_status"], Transfer.Status.PENDING)
        self.assertEqual(data["new_status"], Transfer.Status.PROCESSING)

        await disconnect_stream(iterator)
        self.assertEqual(activity_notifier.subscriber_count(self.transfer.pk), 0)

    async def test_last_event_id_takes_precedence_over_after(self):
        created_id = await self.transfer.activities.values_list("id", flat=True).aget()
        await sync_to_async(submit_transfer, thread_sensitive=True)(self.transfer.pk)
        response = await self.open_stream(
            f"{self.url}?after=999999",
            headers={"Last-Event-ID": str(created_id)},
        )
        iterator = response.streaming_content.__aiter__()
        chunk = await asyncio.wait_for(anext(iterator), timeout=1)
        _, data = parse_sse_data(chunk)
        self.assertEqual(data["type"], TransferActivity.Type.SUBMITTED)
        await disconnect_stream(iterator)

    async def test_unknown_transfer_and_invalid_cursor_are_rejected(self):
        missing_url = reverse(
            "transfer-activity-stream", kwargs={"transfer_id": uuid4()}
        )
        missing = await self.open_stream(missing_url)
        invalid = await self.open_stream(f"{self.url}?after=invalid")

        self.assertEqual(missing.status_code, 404)
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(missing.streaming)
        self.assertFalse(invalid.streaming)

    async def test_heartbeat_and_cancelled_stream_cleanup(self):
        cursor = await self.transfer.activities.values_list("id", flat=True).aget()
        with patch("transfers.streaming.HEARTBEAT_INTERVAL_SECONDS", 0.01):
            response = await self.open_stream(f"{self.url}?after={cursor}")
            iterator = response.streaming_content.__aiter__()
            heartbeat = await asyncio.wait_for(anext(iterator), timeout=1)
            self.assertEqual(heartbeat, b": keepalive\n\n")

            pending = asyncio.create_task(anext(iterator))
            await asyncio.sleep(0)
            pending.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await pending

        self.assertEqual(activity_notifier.subscriber_count(self.transfer.pk), 0)

    async def test_no_cross_transfer_delivery(self):
        other = await sync_to_async(create_transfer, thread_sensitive=True)(
            amount=Decimal("2000.00"),
            currency=Transfer.Currency.USD,
            recipient_ref="OTHER",
        )
        cursor = await self.transfer.activities.values_list("id", flat=True).aget()
        with patch("transfers.streaming.HEARTBEAT_INTERVAL_SECONDS", 0.05):
            response = await self.open_stream(f"{self.url}?after={cursor}")
            iterator = response.streaming_content.__aiter__()
            next_chunk = asyncio.create_task(anext(iterator))

            for _ in range(20):
                if activity_notifier.subscriber_count(self.transfer.pk):
                    break
                await asyncio.sleep(0)
            await sync_to_async(submit_transfer, thread_sensitive=True)(other.pk)

            chunk = await asyncio.wait_for(next_chunk, timeout=1)
            self.assertEqual(chunk, b": keepalive\n\n")
            await disconnect_stream(iterator)

        self.assertEqual(activity_notifier.subscriber_count(), 0)
