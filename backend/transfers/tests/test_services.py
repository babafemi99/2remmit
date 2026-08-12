from decimal import Decimal

from django.test import TestCase

from transfers.exceptions import InvalidTransition
from transfers.models import Transfer
from transfers.services import (
    cancel_transfer,
    complete_transfer,
    create_transfer,
    fail_transfer,
    submit_transfer,
)


class TransferServiceTests(TestCase):
    @staticmethod
    def create_transfer_with_status(status=Transfer.Status.PENDING) -> Transfer:
        return Transfer.objects.create(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
            status=status,
        )

    def assert_transition_is_rejected(self, service, initial_status):
        transfer = self.create_transfer_with_status(initial_status)

        with self.assertRaises(InvalidTransition):
            service(transfer.pk)

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, initial_status)

    def test_create_transfer_persists_validated_business_data(self):
        transfer = create_transfer(
            amount=Decimal("1250.50"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
        )

        transfer.refresh_from_db()

        self.assertEqual(transfer.amount, Decimal("1250.50"))
        self.assertEqual(transfer.currency, Transfer.Currency.GBP)
        self.assertEqual(transfer.recipient_ref, "UNIVERSITY-123")
        self.assertEqual(transfer.status, Transfer.Status.PENDING)

    def test_pending_transfer_can_be_submitted(self):
        transfer = self.create_transfer_with_status()

        submit_transfer(transfer.pk)
        transfer.refresh_from_db()

        self.assertEqual(transfer.status, Transfer.Status.PROCESSING)
        self.assertIsNotNone(transfer.provider_transfer_id)
        self.assertTrue(transfer.provider_transfer_id.startswith("PRV-"))

    def test_submit_rejects_every_non_pending_state(self):
        invalid_states = (
            Transfer.Status.PROCESSING,
            Transfer.Status.COMPLETED,
            Transfer.Status.FAILED,
            Transfer.Status.CANCELLED,
        )

        for initial_status in invalid_states:
            with self.subTest(initial_status=initial_status):
                self.assert_transition_is_rejected(submit_transfer, initial_status)

    def test_pending_transfer_can_be_cancelled(self):
        transfer = self.create_transfer_with_status()

        cancel_transfer(transfer.pk)
        transfer.refresh_from_db()

        self.assertEqual(transfer.status, Transfer.Status.CANCELLED)

    def test_cancel_rejects_every_non_pending_state(self):
        invalid_states = (
            Transfer.Status.PROCESSING,
            Transfer.Status.COMPLETED,
            Transfer.Status.FAILED,
            Transfer.Status.CANCELLED,
        )

        for initial_status in invalid_states:
            with self.subTest(initial_status=initial_status):
                self.assert_transition_is_rejected(cancel_transfer, initial_status)

    def test_processing_transfer_can_be_completed(self):
        transfer = self.create_transfer_with_status(Transfer.Status.PROCESSING)

        complete_transfer(transfer.pk)
        transfer.refresh_from_db()

        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)

    def test_complete_rejects_every_non_processing_state(self):
        invalid_states = (
            Transfer.Status.PENDING,
            Transfer.Status.COMPLETED,
            Transfer.Status.FAILED,
            Transfer.Status.CANCELLED,
        )

        for initial_status in invalid_states:
            with self.subTest(initial_status=initial_status):
                self.assert_transition_is_rejected(complete_transfer, initial_status)

    def test_processing_transfer_can_be_failed(self):
        transfer = self.create_transfer_with_status(Transfer.Status.PROCESSING)

        fail_transfer(transfer.pk)
        transfer.refresh_from_db()

        self.assertEqual(transfer.status, Transfer.Status.FAILED)

    def test_fail_rejects_every_non_processing_state(self):
        invalid_states = (
            Transfer.Status.PENDING,
            Transfer.Status.COMPLETED,
            Transfer.Status.FAILED,
            Transfer.Status.CANCELLED,
        )

        for initial_status in invalid_states:
            with self.subTest(initial_status=initial_status):
                self.assert_transition_is_rejected(fail_transfer, initial_status)

