import hashlib
import hmac
import json
import os
import subprocess
import sys
import urllib.error
from datetime import datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.conf import settings
from django.test import TestCase, override_settings
from django.urls import NoReverseMatch, clear_url_caches, reverse
from rest_framework import status

from transfers.models import Transfer
from transfers.provider_simulator import (
    ProviderDeliveryError,
    SIMULATED_FAILURE_REASON,
    build_provider_event,
    deliver_provider_event,
)


SIMULATOR_SETTINGS = {
    "DEBUG": True,
    "ENABLE_PROVIDER_SIMULATOR": True,
    "PROVIDER_WEBHOOK_SECRET": "test-webhook-secret",
    "PROVIDER_SIMULATOR_WEBHOOK_URL": (
        "http://127.0.0.1:8000/api/webhooks/provider/"
    ),
    "ROOT_URLCONF": "transfers.tests.simulator_urls",
}


class ProviderSimulatorConfigurationTests(TestCase):
    def test_simulator_is_disabled_and_routes_are_absent_by_default(self):
        self.assertFalse(settings.ENABLE_PROVIDER_SIMULATOR)

        with self.assertRaises(NoReverseMatch):
            reverse(
                "provider-simulator-success",
                kwargs={"transfer_id": uuid4()},
            )

    def run_settings_import(self, **environment_overrides):
        environment = {
            **os.environ,
            "DJANGO_SETTINGS_MODULE": "config.settings",
            **environment_overrides,
        }
        return subprocess.run(
            [sys.executable, "-c", "import django; django.setup()"],
            cwd=settings.BASE_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_enabled_simulator_refuses_to_start_when_debug_is_false(self):
        result = self.run_settings_import(
            DJANGO_DEBUG="false",
            ENABLE_PROVIDER_SIMULATOR="true",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ImproperlyConfigured", result.stderr)

    def test_invalid_enablement_boolean_is_rejected(self):
        result = self.run_settings_import(ENABLE_PROVIDER_SIMULATOR="sometimes")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ImproperlyConfigured", result.stderr)

    def test_unapproved_webhook_hostname_is_rejected(self):
        result = self.run_settings_import(
            ENABLE_PROVIDER_SIMULATOR="true",
            PROVIDER_SIMULATOR_WEBHOOK_URL=(
                "https://attacker.example/api/webhooks/provider/"
            ),
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("explicitly allowed host", result.stderr)

    def test_explicitly_allowed_docker_hostname_is_accepted(self):
        result = self.run_settings_import(
            ENABLE_PROVIDER_SIMULATOR="true",
            PROVIDER_SIMULATOR_WEBHOOK_URL=(
                "http://api:8000/api/webhooks/provider/"
            ),
            PROVIDER_SIMULATOR_ALLOWED_HOSTS="127.0.0.1,api",
        )

        self.assertEqual(result.returncode, 0, result.stderr)


class ProviderEnvelopeTests(TestCase):
    def test_success_and_failure_envelopes_use_approved_contract(self):
        success, _ = build_provider_event(
            provider_transfer_id="PRV-123",
            provider_event="transfer.completed",
        )
        failure, _ = build_provider_event(
            provider_transfer_id="PRV-123",
            provider_event="transfer.failed",
        )

        self.assertEqual(success["event"], "transfer.completed")
        self.assertNotIn("reason", success["data"])
        self.assertEqual(failure["event"], "transfer.failed")
        self.assertEqual(failure["data"]["reason"], SIMULATED_FAILURE_REASON)
        self.assertNotEqual(success["event_id"], failure["event_id"])
        self.assertTrue(success["event_id"].startswith("evt_sim_"))
        self.assertTrue(failure["event_id"].startswith("evt_sim_"))
        occurred_at = datetime.fromisoformat(success["occurred_at"])
        self.assertIsNotNone(occurred_at.tzinfo)
        self.assertTrue(success["occurred_at"].endswith("Z"))

    def test_json_bytes_are_deterministic_compact_and_match_payload(self):
        payload, raw_body = build_provider_event(
            provider_transfer_id="PRV-123",
            provider_event="transfer.completed",
        )

        expected = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")

        self.assertEqual(raw_body, expected)
        self.assertNotIn(b" ", raw_body)

    @patch("transfers.provider_simulator.urllib.request.urlopen")
    def test_exact_signed_bytes_are_delivered(self, urlopen):
        response = MagicMock()
        response.status = 200
        urlopen.return_value.__enter__.return_value = response

        delivery = deliver_provider_event(
            webhook_url="http://127.0.0.1:8000/api/webhooks/provider/",
            secret="test-webhook-secret",
            provider_transfer_id="PRV-123",
            provider_event="transfer.completed",
        )

        request = urlopen.call_args.args[0]
        sent_bytes = request.data
        signature = request.headers["X-provider-signature"]
        expected_digest = hmac.new(
            b"test-webhook-secret",
            sent_bytes,
            hashlib.sha256,
        ).hexdigest()

        self.assertEqual(signature, f"sha256={expected_digest}")
        self.assertEqual(json.loads(sent_bytes)["event_id"], delivery.event_id)
        urlopen.assert_called_once_with(request, timeout=5)


@override_settings(**SIMULATOR_SETTINGS)
class ProviderSimulatorAPITests(TestCase):
    @staticmethod
    def create_transfer(**overrides):
        values = {
            "amount": Decimal("1000.00"),
            "currency": Transfer.Currency.GBP,
            "recipient_ref": "SENSITIVE-RECIPIENT",
            "status": Transfer.Status.PROCESSING,
            "provider_transfer_id": "PRV-SIMULATOR",
            **overrides,
        }
        return Transfer.objects.create(**values)

    @staticmethod
    def endpoint(name, transfer_id):
        return reverse(name, kwargs={"transfer_id": transfer_id})

    def test_runtime_guard_returns_not_found_when_disabled(self):
        transfer = self.create_transfer()

        with override_settings(ENABLE_PROVIDER_SIMULATOR=False):
            response = self.client.post(
                self.endpoint("provider-simulator-success", transfer.pk)
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_missing_transfer_returns_not_found(self):
        response = self.client.post(
            self.endpoint("provider-simulator-success", uuid4())
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_processing_states_return_conflict_without_delivery(self):
        for state in (
            Transfer.Status.PENDING,
            Transfer.Status.COMPLETED,
            Transfer.Status.FAILED,
            Transfer.Status.CANCELLED,
        ):
            with self.subTest(state=state):
                transfer = self.create_transfer(
                    status=state,
                    provider_transfer_id=None,
                )
                with patch(
                    "transfers.simulator_views.deliver_provider_event"
                ) as deliver:
                    response = self.client.post(
                        self.endpoint("provider-simulator-success", transfer.pk)
                    )

                self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
                deliver.assert_not_called()

    def test_processing_transfer_without_provider_id_returns_conflict(self):
        transfer = self.create_transfer(provider_transfer_id=None)

        response = self.client.post(
            self.endpoint("provider-simulator-success", transfer.pk)
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    @override_settings(PROVIDER_WEBHOOK_SECRET="")
    def test_missing_secret_returns_service_unavailable(self):
        transfer = self.create_transfer()

        response = self.client.post(
            self.endpoint("provider-simulator-success", transfer.pk)
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @patch("transfers.simulator_views.deliver_provider_event")
    def test_processing_transfer_delivers_safe_success_response(self, deliver):
        from transfers.provider_simulator import SimulatedProviderDelivery

        transfer = self.create_transfer()
        deliver.return_value = SimulatedProviderDelivery(
            event_id="evt_sim_demo",
            provider_event="transfer.completed",
            webhook_status=200,
        )

        response = self.client.post(
            self.endpoint("provider-simulator-success", transfer.pk)
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.json()),
            {"detail", "event_id", "event", "webhook_status"},
        )
        serialized_response = json.dumps(response.json())
        self.assertNotIn("test-webhook-secret", serialized_response)
        self.assertNotIn("SENSITIVE-RECIPIENT", serialized_response)
        self.assertNotIn("1000.00", serialized_response)

    @patch("transfers.simulator_views.deliver_provider_event")
    def test_failure_endpoint_selects_failed_provider_event(self, deliver):
        from transfers.provider_simulator import SimulatedProviderDelivery

        transfer = self.create_transfer()
        deliver.return_value = SimulatedProviderDelivery(
            event_id="evt_sim_failure",
            provider_event="transfer.failed",
            webhook_status=200,
        )

        self.client.post(
            self.endpoint("provider-simulator-failure", transfer.pk)
        )

        self.assertEqual(
            deliver.call_args.kwargs["provider_event"],
            "transfer.failed",
        )

    @patch("transfers.simulator_views.deliver_provider_event")
    def test_downstream_non_success_returns_bad_gateway(self, deliver):
        transfer = self.create_transfer()
        deliver.side_effect = ProviderDeliveryError(webhook_status=401)

        response = self.client.post(
            self.endpoint("provider-simulator-success", transfer.pk)
        )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.json()["webhook_status"], 401)
        self.assertNotIn("response_body", response.json())

    @patch("transfers.simulator_views.deliver_provider_event")
    def test_network_failure_returns_bad_gateway(self, deliver):
        transfer = self.create_transfer()
        deliver.side_effect = ProviderDeliveryError()

        response = self.client.post(
            self.endpoint("provider-simulator-success", transfer.pk)
        )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(
            response.json(),
            {"detail": "Provider webhook delivery failed"},
        )

    @patch("transfers.provider_simulator.urllib.request.urlopen")
    def test_timeout_is_normalized_as_delivery_error(self, urlopen):
        urlopen.side_effect = TimeoutError

        with self.assertRaises(ProviderDeliveryError):
            deliver_provider_event(
                webhook_url=settings.PROVIDER_SIMULATOR_WEBHOOK_URL,
                secret=settings.PROVIDER_WEBHOOK_SECRET,
                provider_transfer_id="PRV-SIMULATOR",
                provider_event="transfer.completed",
            )
