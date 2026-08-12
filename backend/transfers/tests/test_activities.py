from datetime import datetime, timezone as datetime_timezone
from decimal import Decimal
from unittest.mock import patch

from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.urls import reverse

from transfers.idempotency import create_transfer_idempotently
from transfers.models import Transfer, TransferActivity
from transfers.services import create_transfer, submit_transfer
from transfers.webhooks import process_provider_webhook


OCCURRED_AT = datetime(2026, 8, 12, 12, 0, tzinfo=datetime_timezone.utc)


class TransferActivityTests(TestCase):
    @staticmethod
    def create():
        return create_transfer(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
        )

    def test_lifecycle_services_create_ordered_business_activities(self):
        transfer = self.create()
        submit_transfer(transfer.pk)

        activities = list(transfer.activities.all())
        self.assertEqual(
            [activity.type for activity in activities],
            [TransferActivity.Type.CREATED, TransferActivity.Type.SUBMITTED],
        )
        self.assertEqual(activities[0].source, TransferActivity.Source.API)
        self.assertIsNone(activities[0].previous_status)
        self.assertEqual(activities[0].new_status, Transfer.Status.PENDING)
        self.assertEqual(activities[1].previous_status, Transfer.Status.PENDING)
        self.assertEqual(activities[1].new_status, Transfer.Status.PROCESSING)

    def test_transfer_with_activity_is_protected_from_deletion(self):
        transfer = self.create()
        with self.assertRaises(ProtectedError):
            transfer.delete()

    def test_activity_creation_rolls_back_with_transfer_transition(self):
        transfer = self.create()

        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                submit_transfer(transfer.pk)
                raise RuntimeError("force rollback")

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, Transfer.Status.PENDING)
        self.assertEqual(
            list(transfer.activities.values_list("type", flat=True)),
            [TransferActivity.Type.CREATED],
        )

    @patch(
        "transfers.services.TransferActivity.objects.create",
        side_effect=RuntimeError("activity insert failed"),
    )
    def test_activity_insert_failure_rolls_back_transition(self, _create_activity):
        transfer = Transfer.objects.create(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
        )

        with self.assertRaises(RuntimeError):
            submit_transfer(transfer.pk)

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, Transfer.Status.PENDING)
        self.assertIsNone(transfer.provider_transfer_id)

    def test_idempotent_create_replay_creates_one_activity(self):
        arguments = {
            "idempotency_key": "activity-create",
            "amount": Decimal("1000.00"),
            "currency": Transfer.Currency.GBP,
            "recipient_ref": "UNIVERSITY-123",
        }
        create_transfer_idempotently(**arguments)
        create_transfer_idempotently(**arguments)

        self.assertEqual(Transfer.objects.count(), 1)
        self.assertEqual(TransferActivity.objects.count(), 1)

    def test_processed_webhook_links_one_provider_activity(self):
        transfer = self.create()
        submit_transfer(transfer.pk)
        transfer.refresh_from_db()
        result = process_provider_webhook(
            event_id="evt_activity",
            event="transfer.completed",
            occurred_at=OCCURRED_AT,
            data={"provider_transfer_id": transfer.provider_transfer_id},
        )

        activity = transfer.activities.get(type=TransferActivity.Type.COMPLETED)
        self.assertEqual(activity.source, TransferActivity.Source.PROVIDER)
        self.assertEqual(activity.provider_event, result.event)
        self.assertEqual(activity.previous_status, Transfer.Status.PROCESSING)
        self.assertEqual(activity.new_status, Transfer.Status.COMPLETED)

        process_provider_webhook(
            event_id="evt_activity",
            event="transfer.completed",
            occurred_at=OCCURRED_AT,
            data={"provider_transfer_id": transfer.provider_transfer_id},
        )
        self.assertEqual(
            transfer.activities.filter(type=TransferActivity.Type.COMPLETED).count(),
            1,
        )

    def test_contradictory_webhook_creates_no_customer_activity(self):
        transfer = self.create()
        submit_transfer(transfer.pk)
        transfer.refresh_from_db()
        process_provider_webhook(
            event_id="evt_first",
            event="transfer.completed",
            occurred_at=OCCURRED_AT,
            data={"provider_transfer_id": transfer.provider_transfer_id},
        )
        process_provider_webhook(
            event_id="evt_second",
            event="transfer.failed",
            occurred_at=OCCURRED_AT,
            data={"provider_transfer_id": transfer.provider_transfer_id},
        )

        self.assertEqual(transfer.activities.count(), 3)
        self.assertFalse(
            transfer.activities.filter(type=TransferActivity.Type.FAILED).exists()
        )


class TransferActivityAPITests(TestCase):
    def test_history_is_oldest_first_and_excludes_sensitive_fields(self):
        transfer = create_transfer(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="SENSITIVE-RECIPIENT",
        )
        submit_transfer(transfer.pk)

        response = self.client.get(
            reverse("transfer-activity-list", kwargs={"transfer_id": transfer.pk})
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["type"] for item in response.json()],
            ["created", "submitted"],
        )
        self.assertEqual(response.json()[0]["message"], "Transfer created")
        self.assertNotIn("recipient_ref", response.json()[0])
        self.assertNotIn("amount", response.json()[0])

    def test_history_returns_not_found_and_is_read_only(self):
        import uuid

        missing = reverse(
            "transfer-activity-list", kwargs={"transfer_id": uuid.uuid4()}
        )
        self.assertEqual(self.client.get(missing).status_code, 404)

        transfer = create_transfer(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
        )
        url = reverse(
            "transfer-activity-list", kwargs={"transfer_id": transfer.pk}
        )
        self.assertEqual(self.client.post(url, {}).status_code, 405)
