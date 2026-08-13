import hashlib
import hmac
import json
import threading
import urllib.error
import urllib.request
from decimal import Decimal

from django.test import LiveServerTestCase, override_settings

from transfers.models import (
    IdempotencyRecord,
    Transfer,
    TransferActivity,
    WebhookEvent,
)


class LiveHttpMixin:
    def post_json(self, path, payload, *, headers=None):
        raw_body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            f"{self.live_server_url}{path}",
            data=raw_body,
            headers={"Content-Type": "application/json", **(headers or {})},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read())


class TransferCreationIdempotencyLiveHttpTests(LiveHttpMixin, LiveServerTestCase):
    create_path = "/api/transfers/"
    payload = {
        "amount": "1250.00",
        "currency": "GBP",
        "recipient_ref": "LIVE-IDEMPOTENCY-TEST",
    }

    def create(self, key, payload=None):
        headers = {"Idempotency-Key": key} if key is not None else {}
        return self.post_json(
            self.create_path,
            payload or self.payload,
            headers=headers,
        )

    def test_same_key_and_body_replays_one_durable_transfer(self):
        first_status, first_body = self.create("live-replay-key")
        second_status, second_body = self.create("live-replay-key")

        self.assertEqual(first_status, 201)
        self.assertEqual(second_status, 201)
        self.assertEqual(second_body, first_body)
        self.assertEqual(Transfer.objects.count(), 1)
        self.assertEqual(IdempotencyRecord.objects.count(), 1)
        self.assertEqual(TransferActivity.objects.count(), 1)
        self.assertEqual(
            TransferActivity.objects.get().type,
            TransferActivity.Type.CREATED,
        )

    def test_same_key_with_changed_body_returns_conflict(self):
        first_status, first_body = self.create("live-conflict-key")
        changed = {**self.payload, "amount": "2500.00"}
        second_status, second_body = self.create(
            "live-conflict-key",
            changed,
        )

        self.assertEqual(first_status, 201)
        self.assertEqual(second_status, 409)
        self.assertIn("different request", second_body["detail"])
        self.assertEqual(Transfer.objects.count(), 1)
        self.assertEqual(
            str(Transfer.objects.get().pk),
            first_body["id"],
        )
        self.assertEqual(IdempotencyRecord.objects.count(), 1)
        self.assertEqual(TransferActivity.objects.count(), 1)

    def test_missing_key_is_rejected_without_durable_state(self):
        response_status, response_body = self.create(None)

        self.assertEqual(response_status, 400)
        self.assertEqual(
            response_body["detail"],
            "Idempotency-Key header is required",
        )
        self.assertEqual(Transfer.objects.count(), 0)
        self.assertEqual(IdempotencyRecord.objects.count(), 0)
        self.assertEqual(TransferActivity.objects.count(), 0)

    def test_concurrent_same_key_requests_create_one_transfer(self):
        barrier = threading.Barrier(3)
        results = []
        failures = []

        def send_request():
            try:
                barrier.wait(timeout=5)
                results.append(self.create("live-concurrent-key"))
            except Exception as exc:  # pragma: no cover - asserted below
                failures.append(exc)

        threads = [threading.Thread(target=send_request) for _ in range(2)]
        for thread in threads:
            thread.start()
        barrier.wait(timeout=5)
        for thread in threads:
            thread.join(timeout=15)

        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(failures, [])
        self.assertEqual(len(results), 2)
        self.assertTrue(all(status == 201 for status, _ in results))
        self.assertEqual(results[0][1], results[1][1])
        self.assertEqual(Transfer.objects.count(), 1)
        self.assertEqual(IdempotencyRecord.objects.count(), 1)
        self.assertEqual(TransferActivity.objects.count(), 1)


class TransferLifecycleLiveHttpTests(LiveHttpMixin, LiveServerTestCase):
    def test_cancel_after_submit_returns_conflict_and_preserves_processing(self):
        create_status, created = self.post_json(
            "/api/transfers/",
            {
                "amount": "750.00",
                "currency": "GBP",
                "recipient_ref": "LIVE-LIFECYCLE-TEST",
            },
            headers={"Idempotency-Key": "live-lifecycle-key"},
        )
        transfer_path = f"/api/transfers/{created['id']}"

        submit_status, submitted = self.post_json(
            f"{transfer_path}/submit/",
            {},
        )
        cancel_status, cancel_body = self.post_json(
            f"{transfer_path}/cancel/",
            {},
        )

        transfer = Transfer.objects.get(pk=created["id"])
        self.assertEqual(create_status, 201)
        self.assertEqual(submit_status, 200)
        self.assertEqual(submitted["status"], Transfer.Status.PROCESSING)
        self.assertEqual(cancel_status, 409)
        self.assertIn("Cannot cancel", cancel_body["detail"])
        self.assertEqual(transfer.status, Transfer.Status.PROCESSING)
        self.assertEqual(
            list(
                transfer.activities.order_by("id").values_list("type", flat=True)
            ),
            [TransferActivity.Type.CREATED, TransferActivity.Type.SUBMITTED],
        )


@override_settings(PROVIDER_WEBHOOK_SECRET="live-webhook-secret")
class ProviderWebhookLiveHttpTests(LiveHttpMixin, LiveServerTestCase):
    webhook_path = "/api/webhooks/provider/"
    secret = "live-webhook-secret"

    @staticmethod
    def create_processing_transfer(provider_transfer_id="PRV-LIVE-HTTP"):
        return Transfer.objects.create(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="LIVE-WEBHOOK-TEST",
            status=Transfer.Status.PROCESSING,
            provider_transfer_id=provider_transfer_id,
        )

    def event_payload(self, **overrides):
        payload = {
            "event_id": "evt_live_http",
            "event": "transfer.completed",
            "occurred_at": "2026-08-12T12:00:00Z",
            "data": {"provider_transfer_id": "PRV-LIVE-HTTP"},
        }
        payload.update(overrides)
        return payload

    def sign(self, payload):
        raw_body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        digest = hmac.new(
            self.secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        return f"sha256={digest}"

    def deliver(self, payload, signature=None):
        headers = (
            {"X-Provider-Signature": signature}
            if signature is not None
            else {}
        )
        return self.post_json(self.webhook_path, payload, headers=headers)

    def test_valid_signed_event_mutates_transfer_and_records_event_activity(self):
        transfer = self.create_processing_transfer()
        payload = self.event_payload()

        response_status, response_body = self.deliver(
            payload,
            self.sign(payload),
        )

        transfer.refresh_from_db()
        event = WebhookEvent.objects.get(event_id="evt_live_http")
        activity = TransferActivity.objects.get(provider_event=event)
        self.assertEqual(response_status, 200)
        self.assertEqual(response_body["detail"], "Webhook processed")
        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(
            event.processing_outcome,
            WebhookEvent.ProcessingOutcome.PROCESSED,
        )
        self.assertEqual(activity.type, TransferActivity.Type.COMPLETED)
        self.assertEqual(activity.source, TransferActivity.Source.PROVIDER)

    def test_missing_and_invalid_signatures_are_rejected_before_writes(self):
        transfer = self.create_processing_transfer()
        payload = self.event_payload()

        missing_status, _ = self.deliver(payload)
        invalid_status, _ = self.deliver(payload, f"sha256={'0' * 64}")

        transfer.refresh_from_db()
        self.assertEqual(missing_status, 401)
        self.assertEqual(invalid_status, 401)
        self.assertEqual(transfer.status, Transfer.Status.PROCESSING)
        self.assertEqual(WebhookEvent.objects.count(), 0)
        self.assertEqual(TransferActivity.objects.count(), 0)

    def test_exact_duplicate_is_acknowledged_without_duplicate_side_effects(self):
        transfer = self.create_processing_transfer()
        payload = self.event_payload()
        signature = self.sign(payload)

        first_status, _ = self.deliver(payload, signature)
        second_status, second_body = self.deliver(payload, signature)

        transfer.refresh_from_db()
        self.assertEqual(first_status, 200)
        self.assertEqual(second_status, 200)
        self.assertTrue(second_body["duplicate"])
        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(WebhookEvent.objects.count(), 1)
        self.assertEqual(TransferActivity.objects.count(), 1)

    def test_changed_data_under_same_event_id_returns_conflict(self):
        transfer = self.create_processing_transfer()
        original = self.event_payload()
        changed = self.event_payload(
            data={"provider_transfer_id": "PRV-DIFFERENT"},
        )

        first_status, _ = self.deliver(original, self.sign(original))
        second_status, second_body = self.deliver(changed, self.sign(changed))

        transfer.refresh_from_db()
        self.assertEqual(first_status, 200)
        self.assertEqual(second_status, 409)
        self.assertIn("different event data", second_body["detail"])
        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(WebhookEvent.objects.count(), 1)
        self.assertEqual(TransferActivity.objects.count(), 1)

    def test_completed_then_failed_preserves_first_terminal_outcome(self):
        transfer = self.create_processing_transfer()
        completed = self.event_payload()
        failed = self.event_payload(
            event_id="evt_live_http_failed",
            event="transfer.failed",
            occurred_at="2026-08-12T12:01:00Z",
            data={
                "provider_transfer_id": "PRV-LIVE-HTTP",
                "reason": "Provider rejected transfer",
            },
        )

        completed_status, _ = self.deliver(completed, self.sign(completed))
        failed_status, failed_body = self.deliver(failed, self.sign(failed))

        transfer.refresh_from_db()
        rejected_event = WebhookEvent.objects.get(
            event_id="evt_live_http_failed"
        )
        self.assertEqual(completed_status, 200)
        self.assertEqual(failed_status, 200)
        self.assertEqual(
            failed_body["detail"],
            "Webhook received but no transition was applied",
        )
        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(WebhookEvent.objects.count(), 2)
        self.assertEqual(
            rejected_event.processing_outcome,
            WebhookEvent.ProcessingOutcome.INVALID_TRANSITION,
        )
        self.assertEqual(TransferActivity.objects.count(), 1)
        self.assertEqual(
            TransferActivity.objects.get().type,
            TransferActivity.Type.COMPLETED,
        )
