from decimal import Decimal
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from transfers.models import Transfer


class TransferModelTests(TestCase):
    @staticmethod
    def create_transfer(**overrides: object) -> Transfer:
        values: dict[str, object] = {
            "amount": Decimal("1000.00"),
            "currency": Transfer.Currency.GBP,
            "recipient_ref": "UNIVERSITY-123",
            **overrides,
        }
        return Transfer.objects.create(**values)

    def test_new_transfer_defaults_to_pending(self):
        transfer = self.create_transfer()

        self.assertEqual(transfer.status, Transfer.Status.PENDING)

    def test_public_reference_is_generated_automatically(self):
        transfer = self.create_transfer()

        self.assertIsNotNone(transfer.reference)
        self.assertEqual(len(transfer.reference), 14)

    def test_public_reference_starts_with_trf_prefix(self):
        transfer = self.create_transfer()

        self.assertTrue(transfer.reference.startswith("TRF-"))

    def test_generated_public_references_are_unique(self):
        references = {self.create_transfer().reference for _ in range(20)}

        self.assertEqual(len(references), 20)

    def test_database_rejects_duplicate_public_reference(self):
        transfer = self.create_transfer()

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_transfer(reference=transfer.reference)

    def test_uuid_primary_key_is_generated_automatically(self):
        transfer = self.create_transfer()

        self.assertIsInstance(transfer.pk, UUID)

    def test_generated_primary_key_is_uuid_version_7(self):
        transfer = self.create_transfer()

        self.assertEqual(transfer.pk.version, 7)

    def test_supported_currencies_pass_model_validation(self):
        supported_currencies = (
            Transfer.Currency.NGN,
            Transfer.Currency.USD,
            Transfer.Currency.GBP,
        )

        for currency in supported_currencies:
            with self.subTest(currency=currency):
                transfer = Transfer(
                    amount=Decimal("1000.00"),
                    currency=currency,
                    recipient_ref="UNIVERSITY-123",
                )

                transfer.full_clean()

    def test_unsupported_currency_fails_model_validation(self):
        transfer = Transfer(
            amount=Decimal("1000.00"),
            currency="EUR",
            recipient_ref="UNIVERSITY-123",
        )

        with self.assertRaises(ValidationError) as context:
            transfer.full_clean()

        self.assertIn("currency", context.exception.message_dict)

    def test_unsupported_status_fails_model_validation(self):
        transfer = Transfer(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
            status="refunded",
        )

        with self.assertRaises(ValidationError) as context:
            transfer.full_clean()

        self.assertIn("status", context.exception.message_dict)

    def test_amount_is_stored_as_an_exact_decimal(self):
        transfer = self.create_transfer(amount=Decimal("123456.78"))

        transfer.refresh_from_db()

        self.assertEqual(transfer.amount, Decimal("123456.78"))
        self.assertIsInstance(transfer.amount, Decimal)

    def test_amount_outside_configured_precision_fails_model_validation(self):
        invalid_amounts = (
            Decimal("12345678901234567.89"),
            Decimal("1000.001"),
        )

        for amount in invalid_amounts:
            with self.subTest(amount=amount):
                transfer = Transfer(
                    amount=amount,
                    currency=Transfer.Currency.GBP,
                    recipient_ref="UNIVERSITY-123",
                )

                with self.assertRaises(ValidationError) as context:
                    transfer.full_clean()

                self.assertIn("amount", context.exception.message_dict)

    def test_non_positive_amounts_fail_model_validation(self):
        for amount in (Decimal("0.00"), Decimal("-1000.00")):
            with self.subTest(amount=amount):
                transfer = Transfer(
                    amount=amount,
                    currency=Transfer.Currency.GBP,
                    recipient_ref="UNIVERSITY-123",
                )

                with self.assertRaises(ValidationError) as context:
                    transfer.full_clean()

                self.assertIn("amount", context.exception.message_dict)

    def test_database_rejects_non_positive_amounts(self):
        for amount in (Decimal("0.00"), Decimal("-1000.00")):
            with self.subTest(amount=amount):
                with self.assertRaises(IntegrityError), transaction.atomic():
                    self.create_transfer(amount=amount)

    def test_pending_transfer_may_have_no_provider_transfer_id(self):
        transfer = self.create_transfer(provider_transfer_id=None)

        transfer.full_clean()
        transfer.refresh_from_db()

        self.assertIsNone(transfer.provider_transfer_id)

    def test_database_rejects_duplicate_provider_transfer_id(self):
        self.create_transfer(provider_transfer_id="PROVIDER-123")

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.create_transfer(provider_transfer_id="PROVIDER-123")

    def test_timestamps_are_populated_when_transfer_is_created(self):
        transfer = self.create_transfer()

        self.assertIsNotNone(transfer.created_at)
        self.assertIsNotNone(transfer.updated_at)

    def test_updated_at_changes_when_transfer_is_updated(self):
        transfer = self.create_transfer()
        original_updated_at = transfer.updated_at

        transfer.amount = Decimal("1250.00")
        transfer.save()

        transfer.refresh_from_db()

        self.assertGreater(transfer.updated_at, original_updated_at)

    def test_required_business_fields_fail_model_validation_when_blank(self):
        invalid_transfers = (
            (
                "amount",
                Transfer(
                    amount=None,
                    currency=Transfer.Currency.GBP,
                    recipient_ref="UNIVERSITY-123",
                ),
            ),
            (
                "currency",
                Transfer(
                    amount=Decimal("1000.00"),
                    currency="",
                    recipient_ref="UNIVERSITY-123",
                ),
            ),
            (
                "recipient_ref",
                Transfer(
                    amount=Decimal("1000.00"),
                    currency=Transfer.Currency.GBP,
                    recipient_ref="",
                ),
            ),
        )

        for field, transfer in invalid_transfers:
            with self.subTest(field=field):
                with self.assertRaises(ValidationError) as context:
                    transfer.full_clean()

                self.assertIn(field, context.exception.message_dict)
