import logging

from django.conf import settings
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from transfers.models import Transfer
from transfers.provider_simulator import (
    ProviderDeliveryError,
    deliver_provider_event,
)


logger = logging.getLogger(__name__)


class ProviderSimulatorView(APIView):
    provider_event = ""

    def post(self, _request, transfer_id):
        if not settings.DEBUG or not settings.ENABLE_PROVIDER_SIMULATOR:
            raise Http404

        transfer = get_object_or_404(Transfer, pk=transfer_id)

        if transfer.status != Transfer.Status.PROCESSING:
            return Response(
                {"detail": "Only processing transfers can be simulated"},
                status=status.HTTP_409_CONFLICT,
            )

        if not transfer.provider_transfer_id:
            return Response(
                {"detail": "Transfer has no provider transfer ID"},
                status=status.HTTP_409_CONFLICT,
            )

        if not settings.PROVIDER_WEBHOOK_SECRET:
            return Response(
                {"detail": "Provider simulator is not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            delivery = deliver_provider_event(
                webhook_url=settings.PROVIDER_SIMULATOR_WEBHOOK_URL,
                secret=settings.PROVIDER_WEBHOOK_SECRET,
                provider_transfer_id=transfer.provider_transfer_id,
                provider_event=self.provider_event,
            )
        except ProviderDeliveryError as exc:
            log_context = {
                "event": "provider_simulator.delivery_failed",
                "transfer_id": str(transfer.pk),
                "transfer_ref": transfer.reference,
                "provider_transfer_id": transfer.provider_transfer_id,
                "provider_event": self.provider_event,
            }
            if exc.webhook_status is not None:
                log_context["webhook_status"] = exc.webhook_status

            logger.warning(
                "Simulated provider webhook delivery failed",
                extra=log_context,
            )
            body = {"detail": "Provider webhook delivery failed"}
            if exc.webhook_status is not None:
                body = {
                    "detail": "Provider event was rejected by the webhook endpoint",
                    "webhook_status": exc.webhook_status,
                }
            return Response(body, status=status.HTTP_502_BAD_GATEWAY)

        logger.info(
            "Simulated provider event delivered",
            extra={
                "event": "provider_simulator.delivered",
                "transfer_id": str(transfer.pk),
                "transfer_ref": transfer.reference,
                "provider_transfer_id": transfer.provider_transfer_id,
                "event_id": delivery.event_id,
                "provider_event": delivery.provider_event,
                "webhook_status": delivery.webhook_status,
            },
        )
        return Response(
            {
                "detail": "Provider event delivered",
                "event_id": delivery.event_id,
                "event": delivery.provider_event,
                "webhook_status": delivery.webhook_status,
            }
        )


class SimulateTransferSuccessView(ProviderSimulatorView):
    provider_event = "transfer.completed"


class SimulateTransferFailureView(ProviderSimulatorView):
    provider_event = "transfer.failed"
