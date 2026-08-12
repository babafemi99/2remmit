import hashlib
import hmac
import json
from decimal import Decimal

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from transfers.models import Transfer, WebhookEvent


@override_settings(PROVIDER_WEBHOOK_SECRET="test-webhook-secret")
class ProviderWebhookSignatureTests(APITestCase):
    secret = "test-webhook-secret"
    payload = (
        b'{"event_id":"evt_1","event":"transfer.completed",'
        b'"occurred_at":"2026-08-12T12:00:00Z","data":'
        b'{"provider_transfer_id":"PRV-123"}}'
    )

    @staticmethod
    def sign(payload: bytes, secret: str) -> str:
        digest = hmac.new(
            secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return f"sha256={digest}"

    def post_webhook(self, payload=None, signature=None):
        headers = (
            {"HTTP_X_PROVIDER_SIGNATURE": signature}
            if signature is not None
            else {}
        )
        return self.client.post(
            reverse("provider-webhook"),
            data=payload or self.payload,
            content_type="application/json",
            **headers,
        )

    @staticmethod
    def create_processing_transfer(provider_transfer_id="PRV-123"):
        return Transfer.objects.create(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
            status=Transfer.Status.PROCESSING,
            provider_transfer_id=provider_transfer_id,
        )

    def test_valid_signature_processes_supported_event(self):
        self.create_processing_transfer()

        response = self.post_webhook(signature=self.sign(self.payload, self.secret))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "Webhook processed")

    def test_invalid_signature_returns_unauthorized(self):
        response = self.post_webhook(signature=f"sha256={'0' * 64}")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["detail"], "Invalid webhook signature")

    def test_missing_signature_returns_unauthorized(self):
        response = self.post_webhook()

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["detail"], "Invalid webhook signature")

    def test_modified_body_with_old_signature_returns_unauthorized(self):
        signature = self.sign(self.payload, self.secret)
        modified_payload = self.payload.replace(
            b'"transfer.completed"',
            b'"transfer.failed"',
        )

        response = self.post_webhook(
            payload=modified_payload,
            signature=signature,
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_signature_generated_with_wrong_secret_returns_unauthorized(self):
        signature = self.sign(self.payload, "wrong-secret")

        response = self.post_webhook(signature=signature)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(PROVIDER_WEBHOOK_SECRET="")
    def test_unconfigured_secret_fails_closed(self):
        signature = self.sign(self.payload, "")

        response = self.post_webhook(signature=signature)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_malformed_json_returns_bad_request_without_creating_event(self):
        payload = b'{"event_id":'

        response = self.post_webhook(
            payload=payload,
            signature=self.sign(payload, self.secret),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WebhookEvent.objects.count(), 0)

    def test_unsupported_event_returns_bad_request_without_creating_event(self):
        payload = self.payload.replace(
            b'"transfer.completed"',
            b'"transfer.reversed"',
        )

        response = self.post_webhook(
            payload=payload,
            signature=self.sign(payload, self.secret),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WebhookEvent.objects.count(), 0)

    def test_missing_nested_provider_transfer_id_returns_bad_request(self):
        payload = (
            b'{"event_id":"evt_1","event":"transfer.completed",'
            b'"occurred_at":"2026-08-12T12:00:00Z","data":{}}'
        )

        response = self.post_webhook(
            payload=payload,
            signature=self.sign(payload, self.secret),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WebhookEvent.objects.count(), 0)

    def test_invalid_occurred_at_returns_bad_request(self):
        payload = self.payload.replace(
            b'"2026-08-12T12:00:00Z"',
            b'"not-a-date"',
        )

        response = self.post_webhook(
            payload=payload,
            signature=self.sign(payload, self.secret),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WebhookEvent.objects.count(), 0)

    def test_completed_event_rejects_reason(self):
        payload = self.payload.replace(
            b'"PRV-123"}',
            b'"PRV-123","reason":"not-applicable"}',
        )

        response = self.post_webhook(
            payload=payload,
            signature=self.sign(payload, self.secret),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WebhookEvent.objects.count(), 0)

    def test_failed_event_accepts_reason_without_persisting_it(self):
        transfer = self.create_processing_transfer()
        payload_data = {
            "event_id": "evt_failed",
            "event": "transfer.failed",
            "occurred_at": "2026-08-12T12:00:00Z",
            "data": {
                "provider_transfer_id": "PRV-123",
                "reason": "beneficiary_bank_unavailable",
            },
        }
        payload = json.dumps(payload_data, separators=(",", ":")).encode()

        response = self.post_webhook(
            payload=payload,
            signature=self.sign(payload, self.secret),
        )

        transfer.refresh_from_db()
        event = WebhookEvent.objects.get(event_id="evt_failed")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(transfer.status, Transfer.Status.FAILED)
        self.assertIsNone(event.error_message)

    def test_unknown_provider_transfer_is_recorded_and_acknowledged(self):
        response = self.post_webhook(
            signature=self.sign(self.payload, self.secret),
        )

        event = WebhookEvent.objects.get(event_id="evt_1")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            event.processing_outcome,
            WebhookEvent.ProcessingOutcome.UNKNOWN_TRANSFER,
        )
        self.assertIsNone(event.transfer)

    def test_exact_duplicate_is_acknowledged_without_second_event(self):
        self.create_processing_transfer()
        signature = self.sign(self.payload, self.secret)

        first = self.post_webhook(signature=signature)
        second = self.post_webhook(signature=signature)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data["duplicate"])
        self.assertEqual(WebhookEvent.objects.count(), 1)

    def test_reused_event_id_with_changed_data_returns_conflict(self):
        self.create_processing_transfer()
        first_signature = self.sign(self.payload, self.secret)
        self.post_webhook(signature=first_signature)
        changed_payload = self.payload.replace(b"PRV-123", b"PRV-456")

        response = self.post_webhook(
            payload=changed_payload,
            signature=self.sign(changed_payload, self.secret),
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(WebhookEvent.objects.count(), 1)
