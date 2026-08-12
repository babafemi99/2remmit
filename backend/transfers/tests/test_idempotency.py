import hashlib
import json

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from transfers.idempotency import hash_transfer_request
from transfers.models import IdempotencyRecord, Transfer


class TransferCreationIdempotencyTests(APITestCase):
    create_url = reverse("transfer-list-create")

    @staticmethod
    def valid_payload(**overrides):
        return {
            "amount": "1000.00",
            "currency": "GBP",
            "recipient_ref": "UNIVERSITY-123",
            **overrides,
        }

    def post_create(self, key, payload=None):
        headers = {"HTTP_IDEMPOTENCY_KEY": key} if key is not None else {}
        return self.client.post(
            self.create_url,
            payload or self.valid_payload(),
            format="json",
            **headers,
        )

    def test_missing_idempotency_key_is_rejected(self):
        response = self.post_create(None)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Idempotency-Key header is required",
        )
        self.assertEqual(Transfer.objects.count(), 0)

    def test_same_key_and_payload_replays_original_result(self):
        first = self.post_create("same-request")
        second = self.post_create("same-request")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Transfer.objects.count(), 1)
        self.assertEqual(second.data, first.data)
        self.assertEqual(second.data["id"], first.data["id"])
        self.assertEqual(second.data["reference"], first.data["reference"])

    def test_same_key_with_changed_business_data_returns_conflict(self):
        changed_payloads = (
            self.valid_payload(amount="2000.00"),
            self.valid_payload(currency="USD"),
            self.valid_payload(recipient_ref="SUPPLIER-456"),
        )

        for index, changed_payload in enumerate(changed_payloads):
            with self.subTest(changed_payload=changed_payload):
                key = f"conflict-{index}"
                first = self.post_create(key)
                second = self.post_create(key, changed_payload)

                self.assertEqual(first.status_code, status.HTTP_201_CREATED)
                self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)

        self.assertEqual(Transfer.objects.count(), len(changed_payloads))

    def test_equivalent_decimal_representations_replay_same_result(self):
        first = self.post_create(
            "equivalent-decimal",
            self.valid_payload(amount="1000.0"),
        )
        second = self.post_create(
            "equivalent-decimal",
            self.valid_payload(amount="1000.00"),
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.data, first.data)
        self.assertEqual(Transfer.objects.count(), 1)

    def test_trimmed_recipient_reference_replays_same_result(self):
        first = self.post_create(
            "equivalent-recipient",
            self.valid_payload(recipient_ref="  UNIVERSITY-123  "),
        )
        second = self.post_create(
            "equivalent-recipient",
            self.valid_payload(recipient_ref="UNIVERSITY-123"),
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.data, first.data)
        self.assertEqual(Transfer.objects.count(), 1)

    def test_successful_request_persists_completed_idempotency_record(self):
        response = self.post_create("stored-result")
        transfer = Transfer.objects.get()
        record = IdempotencyRecord.objects.get(key="stored-result")
        canonical_json = json.dumps(
            {
                "amount": "1000.00",
                "currency": "GBP",
                "recipient_ref": "UNIVERSITY-123",
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        expected_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(record.request_hash, expected_hash)
        self.assertEqual(record.transfer, transfer)
        self.assertEqual(record.status, IdempotencyRecord.Status.COMPLETED)
        self.assertEqual(record.response_code, status.HTTP_201_CREATED)
        self.assertEqual(record.response_body, response.data)

    def test_existing_processing_record_returns_conflict_without_creating_transfer(self):
        request_hash = hash_transfer_request(
            amount=Transfer._meta.get_field("amount").to_python("1000.00"),
            currency="GBP",
            recipient_ref="UNIVERSITY-123",
        )
        IdempotencyRecord.objects.create(
            key="in-progress",
            request_hash=request_hash,
            request_path="/api/transfers/",
            action="create_transfer",
        )

        response = self.post_create("in-progress")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(Transfer.objects.count(), 0)

