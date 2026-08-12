import json
import os
import subprocess
import sys
from datetime import datetime, timezone as datetime_timezone
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from pythonjsonlogger.json import JsonFormatter

from transfers.exceptions import WebhookEventConflict
from transfers.idempotency import hash_transfer_request
from transfers.models import IdempotencyRecord, Transfer
from transfers.services import cancel_transfer, submit_transfer
from transfers.webhooks import process_provider_webhook


OCCURRED_AT = datetime(2026, 8, 12, 12, 0, tzinfo=datetime_timezone.utc)


class LoggingConfigurationTests(TestCase):
    def test_json_formatter_emits_required_fields_and_safe_context(self):
        formatter = JsonFormatter(
            settings.LOGGING["formatters"]["json"]["format"],
            datefmt=settings.LOGGING["formatters"]["json"]["datefmt"],
            rename_fields=settings.LOGGING["formatters"]["json"][
                "rename_fields"
            ],
        )

        with self.assertLogs("transfers.logging_test", level="INFO") as captured:
            import logging

            logging.getLogger("transfers.logging_test").info(
                "Transfer submitted to provider",
                extra={
                    "event": "transfer.submitted",
                    "transfer_id": "00000000-0000-7000-8000-000000000001",
                    "transfer_ref": "TRF-DEMO12345",
                },
            )

        parsed = json.loads(formatter.format(captured.records[0]))

        self.assertEqual(parsed["level"], "INFO")
        self.assertEqual(parsed["logger"], "transfers.logging_test")
        self.assertEqual(parsed["event"], "transfer.submitted")
        self.assertEqual(parsed["message"], "Transfer submitted to provider")
        self.assertEqual(parsed["transfer_ref"], "TRF-DEMO12345")
        self.assertIn("timestamp", parsed)

    def test_console_is_the_default_and_only_active_handler(self):
        self.assertEqual(settings.LOG_DESTINATION, "console")
        self.assertEqual(settings.ACTIVE_LOG_HANDLERS, ["console"])
        self.assertEqual(
            settings.LOG_HANDLERS["console"]["stream"],
            "ext://sys.stderr",
        )

    def test_invalid_logging_environment_values_fail_configuration(self):
        command = [
            sys.executable,
            "-c",
            "import config.settings",
        ]

        for variable, value in (
            ("LOG_LEVEL", "TRACE"),
            ("LOG_DESTINATION", "victorialogs"),
        ):
            with self.subTest(variable=variable):
                environment = {**os.environ, variable: value}
                result = subprocess.run(
                    command,
                    cwd=settings.BASE_DIR,
                    env=environment,
                    capture_output=True,
                    text=True,
                    check=False,
                )

                self.assertNotEqual(result.returncode, 0)
                self.assertIn("ImproperlyConfigured", result.stderr)


class ApplicationLoggingTests(TestCase):
    @staticmethod
    def create_transfer(status=Transfer.Status.PENDING) -> Transfer:
        return Transfer.objects.create(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="SENSITIVE-RECIPIENT-REF",
            status=status,
            provider_transfer_id=(
                "PRV-LOGGING" if status == Transfer.Status.PROCESSING else None
            ),
        )

    def test_submit_and_cancel_emit_committed_lifecycle_events(self):
        operations = (
            (submit_transfer, "transfer.submitted"),
            (cancel_transfer, "transfer.cancelled"),
        )

        for operation, expected_event in operations:
            with self.subTest(expected_event=expected_event):
                transfer = self.create_transfer()

                with self.assertLogs("transfers.services", level="INFO") as logs:
                    with self.captureOnCommitCallbacks(execute=True):
                        operation(transfer.pk)

                self.assertEqual(len(logs.records), 1)
                self.assertEqual(logs.records[0].event, expected_event)
                self.assertEqual(logs.records[0].transfer_id, str(transfer.pk))

    def test_rolled_back_transition_emits_no_success_log(self):
        transfer = self.create_transfer()

        with self.assertNoLogs("transfers.services", level="INFO"):
            with self.assertRaises(RuntimeError):
                with transaction.atomic():
                    submit_transfer(transfer.pk)
                    raise RuntimeError("force rollback")

    def test_api_invalid_transition_emits_one_warning(self):
        transfer = self.create_transfer(status=Transfer.Status.COMPLETED)

        with self.assertLogs("transfers.views", level="WARNING") as logs:
            self.client.post(
                reverse("transfer-submit", kwargs={"transfer_id": transfer.pk})
            )

        self.assertEqual(len(logs.records), 1)
        self.assertEqual(logs.records[0].event, "transfer.invalid_transition")
        self.assertEqual(logs.records[0].operation, "submit")

    def test_idempotency_replay_conflict_and_in_progress_emit_stable_events(self):
        url = reverse("transfer-list-create")
        payload = {
            "amount": "1000.00",
            "currency": "GBP",
            "recipient_ref": "SENSITIVE-RECIPIENT-REF",
        }
        self.client.post(
            url,
            payload,
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY="secret-client-key",
        )

        with self.assertLogs("transfers.idempotency", level="INFO") as replay:
            self.client.post(
                url,
                payload,
                content_type="application/json",
                HTTP_IDEMPOTENCY_KEY="secret-client-key",
            )

        with self.assertLogs("transfers.idempotency", level="WARNING") as conflict:
            self.client.post(
                url,
                {**payload, "currency": "USD"},
                content_type="application/json",
                HTTP_IDEMPOTENCY_KEY="secret-client-key",
            )

        request_hash = hash_transfer_request(
            amount=Decimal("1000.00"),
            currency="GBP",
            recipient_ref="SENSITIVE-RECIPIENT-REF",
        )
        IdempotencyRecord.objects.create(
            key="processing-secret-key",
            request_hash=request_hash,
            request_path="/api/transfers/",
            action="create_transfer",
        )
        with self.assertLogs("transfers.idempotency", level="INFO") as processing:
            self.client.post(
                url,
                payload,
                content_type="application/json",
                HTTP_IDEMPOTENCY_KEY="processing-secret-key",
            )

        self.assertEqual(replay.records[0].event, "idempotency.replay")
        self.assertEqual(conflict.records[0].event, "idempotency.conflict")
        self.assertEqual(processing.records[0].event, "idempotency.in_progress")
        for record in replay.records + conflict.records + processing.records:
            self.assertNotIn("secret-client-key", str(record.__dict__))
            self.assertNotIn("processing-secret-key", str(record.__dict__))

    @override_settings(PROVIDER_WEBHOOK_SECRET="test-webhook-secret")
    def test_invalid_hmac_log_excludes_signature_payload_and_secret(self):
        raw_payload = b'{"recipient_ref":"SENSITIVE-PAYLOAD-MARKER"}'
        supplied_signature = f"sha256={'0' * 64}"

        with self.assertLogs("transfers.views", level="WARNING") as logs:
            self.client.post(
                reverse("provider-webhook"),
                data=raw_payload,
                content_type="application/json",
                HTTP_X_PROVIDER_SIGNATURE=supplied_signature,
            )

        record_text = str(logs.records[0].__dict__)
        self.assertEqual(logs.records[0].event, "webhook.invalid_signature")
        self.assertNotIn("test-webhook-secret", record_text)
        self.assertNotIn(supplied_signature, record_text)
        self.assertNotIn("SENSITIVE-PAYLOAD-MARKER", record_text)

    def test_webhook_processor_emits_expected_outcome_events(self):
        transfer = self.create_transfer(status=Transfer.Status.PROCESSING)

        with self.assertLogs("transfers.webhooks", level="INFO") as processed:
            with self.captureOnCommitCallbacks(execute=True):
                process_provider_webhook(
                    event_id="evt_processed",
                    event="transfer.completed",
                    occurred_at=OCCURRED_AT,
                    data={"provider_transfer_id": "PRV-LOGGING"},
                )

        with self.assertLogs("transfers.webhooks", level="INFO") as duplicate:
            process_provider_webhook(
                event_id="evt_processed",
                event="transfer.completed",
                occurred_at=OCCURRED_AT,
                data={"provider_transfer_id": "PRV-LOGGING"},
            )

        with self.assertLogs("transfers.webhooks", level="WARNING") as conflict:
            with self.assertRaises(WebhookEventConflict):
                process_provider_webhook(
                    event_id="evt_processed",
                    event="transfer.failed",
                    occurred_at=OCCURRED_AT,
                    data={"provider_transfer_id": "PRV-LOGGING"},
                )

        with self.assertLogs("transfers.webhooks", level="WARNING") as unknown:
            process_provider_webhook(
                event_id="evt_unknown",
                event="transfer.completed",
                occurred_at=OCCURRED_AT,
                data={"provider_transfer_id": "PRV-UNKNOWN"},
            )

        with self.assertLogs("transfers.webhooks", level="WARNING") as invalid:
            process_provider_webhook(
                event_id="evt_invalid",
                event="transfer.failed",
                occurred_at=OCCURRED_AT,
                data={"provider_transfer_id": "PRV-LOGGING"},
            )

        self.assertEqual(processed.records[0].event, "webhook.processed")
        self.assertEqual(duplicate.records[0].event, "webhook.duplicate")
        self.assertEqual(conflict.records[0].event, "webhook.conflict")
        self.assertEqual(unknown.records[0].event, "webhook.unknown_transfer")
        self.assertEqual(invalid.records[0].event, "webhook.invalid_transition")
        self.assertEqual(invalid.records[0].previous_status, Transfer.Status.COMPLETED)
