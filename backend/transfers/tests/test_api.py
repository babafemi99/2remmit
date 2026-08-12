from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from transfers.models import Transfer
from transfers.services import submit_transfer


class TransferAPITests(APITestCase):
    create_url = reverse("transfer-list-create")

    @staticmethod
    def valid_payload(**overrides):
        payload = {
            "amount": "1000.00",
            "currency": "GBP",
            "recipient_ref": "UNIVERSITY-123",
            **overrides,
        }
        return payload

    @staticmethod
    def create_transfer(**overrides) -> Transfer:
        values = {
            "amount": Decimal("1000.00"),
            "currency": Transfer.Currency.GBP,
            "recipient_ref": "UNIVERSITY-123",
            **overrides,
        }
        return Transfer.objects.create(**values)

    def post_create(self, payload=None, key="create-transfer-key"):
        return self.client.post(
            self.create_url,
            payload or self.valid_payload(),
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )

    def test_valid_create_returns_complete_pending_transfer_representation(self):
        response = self.post_create()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            set(response.data),
            {
                "id",
                "reference",
                "amount",
                "currency",
                "recipient_ref",
                "status",
                "provider_transfer_id",
                "created_at",
                "updated_at",
            },
        )
        self.assertEqual(response.data["status"], Transfer.Status.PENDING)
        self.assertIsNone(response.data["provider_transfer_id"])

    def test_create_rejects_non_positive_amounts(self):
        for amount in ("0.00", "-1000.00"):
            with self.subTest(amount=amount):
                response = self.post_create(
                    self.valid_payload(amount=amount),
                    key=f"amount-{amount}",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("amount", response.data)

    def test_create_rejects_unsupported_currency(self):
        response = self.post_create(self.valid_payload(currency="EUR"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("currency", response.data)

    def test_create_rejects_missing_required_fields(self):
        for field in ("amount", "currency", "recipient_ref"):
            with self.subTest(field=field):
                payload = self.valid_payload()
                payload.pop(field)

                response = self.post_create(payload, key=f"missing-{field}")

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)

    def test_create_normalizes_surrounding_recipient_reference_whitespace(self):
        response = self.post_create(
            self.valid_payload(recipient_ref="  UNIVERSITY-123  ")
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["recipient_ref"], "UNIVERSITY-123")

    def test_list_returns_transfers_newest_first(self):
        older = self.create_transfer(recipient_ref="OLDER")
        newer = self.create_transfer(recipient_ref="NEWER")
        now = timezone.now()
        Transfer.objects.filter(pk=older.pk).update(created_at=now - timedelta(minutes=1))
        Transfer.objects.filter(pk=newer.pk).update(created_at=now)

        response = self.client.get(self.create_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["id"] for item in response.data["results"]],
            [str(newer.pk), str(older.pk)],
        )

    def test_list_uses_cursor_pagination(self):
        for index in range(21):
            self.create_transfer(recipient_ref=f"RECIPIENT-{index}")

        first = self.client.get(self.create_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(len(first.data["results"]), 5)
        self.assertIsNotNone(first.data["next"])

        second = self.client.get(first.data["next"])
        self.assertEqual(len(second.data["results"]), 5)
        first_ids = {item["id"] for item in first.data["results"]}
        self.assertTrue(
            first_ids.isdisjoint(item["id"] for item in second.data["results"])
        )

    def test_list_filters_before_paginating(self):
        pending = self.create_transfer(recipient_ref="PENDING")
        self.create_transfer(status=Transfer.Status.COMPLETED)

        response = self.client.get(self.create_url, {"status": "pending"})

        self.assertEqual(
            [item["id"] for item in response.data["results"]],
            [str(pending.pk)],
        )

    def test_detail_returns_existing_transfer(self):
        transfer = self.create_transfer()

        response = self.client.get(
            reverse("transfer-detail", kwargs={"transfer_id": transfer.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(transfer.pk))

    def test_detail_returns_404_for_unknown_transfer(self):
        response = self.client.get(
            reverse("transfer-detail", kwargs={"transfer_id": uuid4()})
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_submit_pending_transfer_returns_processing_transfer(self):
        transfer = self.create_transfer()

        response = self.client.post(
            reverse("transfer-submit", kwargs={"transfer_id": transfer.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Transfer.Status.PROCESSING)
        self.assertTrue(response.data["provider_transfer_id"].startswith("PRV-"))

    def test_submit_illegal_transition_returns_conflict(self):
        transfer = self.create_transfer(status=Transfer.Status.COMPLETED)

        response = self.client.post(
            reverse("transfer-submit", kwargs={"transfer_id": transfer.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_submit_unknown_transfer_returns_not_found(self):
        response = self.client.post(
            reverse("transfer-submit", kwargs={"transfer_id": uuid4()})
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cancel_pending_transfer_returns_cancelled_transfer(self):
        transfer = self.create_transfer()

        response = self.client.post(
            reverse("transfer-cancel", kwargs={"transfer_id": transfer.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Transfer.Status.CANCELLED)

    def test_cancel_processing_transfer_returns_conflict(self):
        transfer = self.create_transfer()
        submit_transfer(transfer.pk)

        response = self.client.post(
            reverse("transfer-cancel", kwargs={"transfer_id": transfer.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_cancel_unknown_transfer_returns_not_found(self):
        response = self.client.post(
            reverse("transfer-cancel", kwargs={"transfer_id": uuid4()})
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
