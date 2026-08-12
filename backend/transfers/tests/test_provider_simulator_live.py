from decimal import Decimal

from django.test import LiveServerTestCase, override_settings
from django.urls import reverse

from transfers.models import Transfer, WebhookEvent


@override_settings(
    DEBUG=True,
    ENABLE_PROVIDER_SIMULATOR=True,
    PROVIDER_WEBHOOK_SECRET="test-webhook-secret",
    ROOT_URLCONF="transfers.tests.simulator_urls",
)
class ProviderSimulatorLiveTests(LiveServerTestCase):
    @staticmethod
    def create_processing_transfer(provider_transfer_id):
        return Transfer.objects.create(
            amount=Decimal("1000.00"),
            currency=Transfer.Currency.GBP,
            recipient_ref="UNIVERSITY-123",
            status=Transfer.Status.PROCESSING,
            provider_transfer_id=provider_transfer_id,
        )

    def simulate(self, endpoint_name, transfer):
        with self.settings(
            PROVIDER_SIMULATOR_WEBHOOK_URL=(
                f"{self.live_server_url}/api/webhooks/provider/"
            )
        ):
            return self.client.post(
                reverse(endpoint_name, kwargs={"transfer_id": transfer.pk})
            )

    def test_simulated_success_traverses_real_webhook_and_completes_transfer(self):
        transfer = self.create_processing_transfer("PRV-LIVE-SUCCESS")

        response = self.simulate("provider-simulator-success", transfer)
        transfer.refresh_from_db()
        event = WebhookEvent.objects.get(transfer=transfer)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(transfer.status, Transfer.Status.COMPLETED)
        self.assertEqual(event.provider_status, WebhookEvent.ProviderStatus.COMPLETED)
        self.assertEqual(
            event.processing_outcome,
            WebhookEvent.ProcessingOutcome.PROCESSED,
        )

    def test_simulated_failure_traverses_real_webhook_and_fails_transfer(self):
        transfer = self.create_processing_transfer("PRV-LIVE-FAILURE")

        response = self.simulate("provider-simulator-failure", transfer)
        transfer.refresh_from_db()
        event = WebhookEvent.objects.get(transfer=transfer)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(transfer.status, Transfer.Status.FAILED)
        self.assertEqual(event.provider_status, WebhookEvent.ProviderStatus.FAILED)
        self.assertEqual(
            event.processing_outcome,
            WebhookEvent.ProcessingOutcome.PROCESSED,
        )
