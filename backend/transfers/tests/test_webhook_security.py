import hashlib
import hmac

from django.test import SimpleTestCase

from transfers.webhook_security import verify_webhook_signature


class WebhookSignatureVerificationTests(SimpleTestCase):
    secret = "test-webhook-secret"
    payload = b'{"event_id":"evt_1","status":"completed"}'

    @staticmethod
    def sign(payload: bytes, secret: str) -> str:
        digest = hmac.new(
            secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return f"sha256={digest}"

    def test_valid_signature_returns_true(self):
        signature = self.sign(self.payload, self.secret)

        self.assertTrue(
            verify_webhook_signature(
                payload=self.payload,
                signature=signature,
                secret=self.secret,
            )
        )

    def test_invalid_signature_returns_false(self):
        signature = f"sha256={'0' * 64}"

        self.assertFalse(
            verify_webhook_signature(
                payload=self.payload,
                signature=signature,
                secret=self.secret,
            )
        )

    def test_modified_body_with_original_signature_returns_false(self):
        signature = self.sign(self.payload, self.secret)

        self.assertFalse(
            verify_webhook_signature(
                payload=b'{"event_id":"evt_1","status":"failed"}',
                signature=signature,
                secret=self.secret,
            )
        )

    def test_signature_generated_with_wrong_secret_returns_false(self):
        signature = self.sign(self.payload, "wrong-secret")

        self.assertFalse(
            verify_webhook_signature(
                payload=self.payload,
                signature=signature,
                secret=self.secret,
            )
        )

    def test_empty_and_malformed_signatures_return_false(self):
        malformed_signatures = (
            "",
            "not-a-signature",
            "sha256=too-short",
            f"sha256={'A' * 64}",
            f"sha512={'0' * 64}",
        )

        for signature in malformed_signatures:
            with self.subTest(signature=signature):
                self.assertFalse(
                    verify_webhook_signature(
                        payload=self.payload,
                        signature=signature,
                        secret=self.secret,
                    )
                )
