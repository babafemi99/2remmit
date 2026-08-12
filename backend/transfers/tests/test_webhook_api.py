import hashlib
import hmac

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


@override_settings(PROVIDER_WEBHOOK_SECRET="test-webhook-secret")
class ProviderWebhookSignatureTests(APITestCase):
    secret = "test-webhook-secret"
    payload = (
        b'{"event_id":"evt_1","provider_transfer_id":"PRV-123",'
        b'"status":"completed","occurred_at":"2026-08-12T12:00:00Z"}'
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

    def test_valid_signature_reaches_existing_placeholder(self):
        response = self.post_webhook(signature=self.sign(self.payload, self.secret))

        self.assertEqual(response.status_code, status.HTTP_501_NOT_IMPLEMENTED)
        self.assertEqual(
            response.data["detail"],
            "Webhook handling not implemented yet.",
        )

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
        modified_payload = self.payload.replace(b'"completed"', b'"failed"')

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
