from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone as datetime_timezone
from decimal import Decimal
from unittest.mock import patch

from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase

from transfers.exceptions import WebhookEventConflict
from transfers.models import Transfer, TransferActivity, WebhookEvent
from transfers.webhooks import process_provider_webhook


OCCURRED_AT = datetime(2026, 8, 12, 12, 0, tzinfo=datetime_timezone.utc)


class WebhookProcessingTests(TestCase):
    @staticmethod
    def create_transfer(status=Transfer.Status.PROCESSING) -> Transfer:
        return Transfer.objects.create(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
            status=status,
            provider_transfer_id="PRV-123",
        )

    @staticmethod
    def process(event_id="evt_1", event="transfer.completed", **overrides):
        values = {
            "event_id": event_id,
            "event": event,
            "occurred_at": OCCURRED_AT,
            "data": {"provider_transfer_id": "PRV-123"},
            **overrides,
        }
        return process_provider_webhook(**values)

    def test_completed_event_transitions_processing_transfer_and_records_outcome(self):
        transfer = self.create_transfer()

        result = self.process()
        transfer.refresh_from_db()
        result.event.refresh_from_db()

        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(
            result.event.provider_status,
            WebhookEvent.ProviderStatus.COMPLETED,
        )
        self.assertEqual(
            result.event.processing_outcome,
            WebhookEvent.ProcessingOutcome.PROCESSED,
        )
        self.assertEqual(result.event.transfer, transfer)
        self.assertIsNotNone(result.event.received_at)
        self.assertIsNotNone(result.event.processed_at)

    def test_failed_event_transitions_processing_transfer_and_records_outcome(self):
        transfer = self.create_transfer()

        result = self.process(event="transfer.failed")
        transfer.refresh_from_db()

        self.assertEqual(transfer.status, Transfer.Status.FAILED)
        self.assertEqual(
            result.event.provider_status,
            WebhookEvent.ProviderStatus.FAILED,
        )
        self.assertEqual(
            result.event.processing_outcome,
            WebhookEvent.ProcessingOutcome.PROCESSED,
        )

    def test_unknown_provider_id_is_recorded_as_deliberate_outcome(self):
        result = self.process(
            data={"provider_transfer_id": "PRV-UNKNOWN"},
        )

        result.event.refresh_from_db()

        self.assertEqual(
            result.event.processing_outcome,
            WebhookEvent.ProcessingOutcome.UNKNOWN_TRANSFER,
        )
        self.assertIsNone(result.event.transfer)
        self.assertIsNotNone(result.event.processed_at)

    def test_exact_duplicate_does_not_apply_transition_twice(self):
        transfer = self.create_transfer()

        first = self.process()
        second = self.process()
        transfer.refresh_from_db()

        self.assertFalse(first.duplicate)
        self.assertTrue(second.duplicate)
        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(WebhookEvent.objects.count(), 1)

    def test_duplicate_event_id_with_changed_durable_data_is_rejected(self):
        transfer = self.create_transfer()
        self.process()

        changed_events = (
            {"event": "transfer.failed"},
            {"data": {"provider_transfer_id": "PRV-DIFFERENT"}},
            {
                "occurred_at": datetime(
                    2026, 8, 12, 12, 1, tzinfo=datetime_timezone.utc
                )
            },
        )

        for changes in changed_events:
            with self.subTest(changes=changes):
                with self.assertRaises(WebhookEventConflict):
                    self.process(**changes)

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(WebhookEvent.objects.count(), 1)

    def test_pending_transfer_events_are_recorded_as_invalid_transitions(self):
        for index, provider_event in enumerate(
            ("transfer.completed", "transfer.failed")
        ):
            with self.subTest(provider_event=provider_event):
                TransferActivity.objects.all().delete()
                Transfer.objects.all().delete()
                transfer = self.create_transfer(status=Transfer.Status.PENDING)

                result = self.process(
                    event_id=f"evt_pending_{index}",
                    event=provider_event,
                )
                transfer.refresh_from_db()

                self.assertEqual(transfer.status, Transfer.Status.PENDING)
                self.assertEqual(
                    result.event.processing_outcome,
                    WebhookEvent.ProcessingOutcome.INVALID_TRANSITION,
                )
                self.assertIsNotNone(result.event.processed_at)

    def test_contradictory_terminal_events_are_recorded_without_mutation(self):
        scenarios = (
            ("transfer.completed", "transfer.failed", Transfer.Status.COMPLETED),
            ("transfer.failed", "transfer.completed", Transfer.Status.FAILED),
        )

        for index, (first_event, second_event, terminal_status) in enumerate(scenarios):
            with self.subTest(first_event=first_event, second_event=second_event):
                TransferActivity.objects.all().delete()
                Transfer.objects.all().delete()
                transfer = self.create_transfer()
                self.process(event_id=f"evt_first_{index}", event=first_event)

                result = self.process(
                    event_id=f"evt_second_{index}",
                    event=second_event,
                )
                transfer.refresh_from_db()

                self.assertEqual(transfer.status, terminal_status)
                self.assertEqual(
                    result.event.processing_outcome,
                    WebhookEvent.ProcessingOutcome.INVALID_TRANSITION,
                )

    def test_second_completed_event_is_recorded_without_reapplying_transition(self):
        transfer = self.create_transfer()
        self.process(event_id="evt_completed_1")

        result = self.process(event_id="evt_completed_2")
        transfer.refresh_from_db()

        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(WebhookEvent.objects.count(), 2)
        self.assertEqual(
            result.event.processing_outcome,
            WebhookEvent.ProcessingOutcome.INVALID_TRANSITION,
        )

    def test_unexpected_exception_rolls_back_event_claim(self):
        self.create_transfer()

        with patch(
            "transfers.webhooks.complete_transfer",
            side_effect=RuntimeError("provider processing failed"),
        ):
            with self.assertRaises(RuntimeError):
                self.process()

        self.assertEqual(WebhookEvent.objects.count(), 0)


class WebhookProcessingConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.transfer = Transfer.objects.create(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
            status=Transfer.Status.PROCESSING,
            provider_transfer_id="PRV-CONCURRENT",
        )

    @staticmethod
    def process_in_thread():
        close_old_connections()
        try:
            result = process_provider_webhook(
                event_id="evt_concurrent",
                event="transfer.completed",
                occurred_at=OCCURRED_AT,
                data={"provider_transfer_id": "PRV-CONCURRENT"},
            )
            return result.duplicate
        finally:
            close_old_connections()

    def test_concurrent_duplicate_deliveries_create_one_event_and_one_transition(self):
        with ThreadPoolExecutor(max_workers=2) as executor:
            duplicates = list(executor.map(lambda _: self.process_in_thread(), range(2)))

        self.transfer.refresh_from_db()

        self.assertEqual(sorted(duplicates), [False, True])
        self.assertEqual(self.transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(WebhookEvent.objects.count(), 1)

    @staticmethod
    def process_terminal_event_in_thread(event_id, event):
        close_old_connections()
        try:
            result = process_provider_webhook(
                event_id=event_id,
                event=event,
                occurred_at=OCCURRED_AT,
                data={"provider_transfer_id": "PRV-CONCURRENT"},
            )
            return result.event.processing_outcome
        finally:
            close_old_connections()

    def test_concurrent_terminal_events_apply_one_transition_and_record_both(self):
        events = (
            ("evt_completed", "transfer.completed"),
            ("evt_failed", "transfer.failed"),
        )

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(self.process_terminal_event_in_thread, *event)
                for event in events
            ]
            outcomes = [future.result() for future in futures]

        self.transfer.refresh_from_db()

        self.assertIn(
            self.transfer.status,
            (Transfer.Status.COMPLETED, Transfer.Status.FAILED),
        )
        self.assertCountEqual(
            outcomes,
            (
                WebhookEvent.ProcessingOutcome.PROCESSED,
                WebhookEvent.ProcessingOutcome.INVALID_TRANSITION,
            ),
        )
        self.assertEqual(WebhookEvent.objects.count(), 2)
