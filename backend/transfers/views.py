import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from transfers.exceptions import InvalidTransition, IdempotencyConflict, IdempotencyInProgress
from transfers.idempotency import create_transfer_idempotently
from transfers.models import Transfer
from transfers.serializers import TransferCreateSerializer, TransferSerializer
from transfers.services import (
    cancel_transfer,
    create_transfer,
    submit_transfer,
)
from transfers.webhook_security import verify_webhook_signature


logger = logging.getLogger(__name__)


class TransferListCreateView(APIView):
    # noinspection PyMethodMayBeStatic
    def get(self, _request):
        transfers = Transfer.objects.all()
        output = TransferSerializer(transfers, many=True)

        return Response(output.data)

    def post(self, request):
        serializer = TransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        idempotency_key = request.headers.get("Idempotency-Key")

        if not idempotency_key:
            return Response(
                {"detail": "Idempotency-Key header is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            body, response_code = create_transfer_idempotently(
                idempotency_key=idempotency_key,
                **serializer.validated_data,
            )

        except IdempotencyConflict as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        except IdempotencyInProgress as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            body,
            status=response_code,
        )


class TransferDetailView(APIView):
    # noinspection PyMethodMayBeStatic
    def get(self, _request, transfer_id):
        transfer = get_object_or_404(Transfer, pk=transfer_id)
        output = TransferSerializer(transfer)

        return Response(output.data)


class TransferSubmitView(APIView):
    # noinspection PyMethodMayBeStatic
    def post(self, _request, transfer_id):
        try:
            transfer = submit_transfer(transfer_id)
        except Transfer.DoesNotExist as exc:
            raise NotFound("Transfer not found") from exc
        except InvalidTransition as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(TransferSerializer(transfer).data)


class TransferCancelView(APIView):
    # noinspection PyMethodMayBeStatic
    def post(self, _request, transfer_id):
        try:
            transfer = cancel_transfer(transfer_id)
        except Transfer.DoesNotExist as exc:
            raise NotFound("Transfer not found") from exc
        except InvalidTransition as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(TransferSerializer(transfer).data)


class ProviderWebhookView(APIView):
    # noinspection PyMethodMayBeStatic
    def post(self, request):
        signature = request.headers.get("X-Provider-Signature", "")
        secret = settings.PROVIDER_WEBHOOK_SECRET

        if not secret or not verify_webhook_signature(
            payload=request.body,
            signature=signature,
            secret=secret,
        ):
            logger.warning(
                "Rejected provider webhook with invalid signature",
                extra={
                    "request_path": request.path,
                    "signature_present": bool(signature),
                },
            )
            return Response(
                {"detail": "Invalid webhook signature"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(
            {"detail": "Webhook handling not implemented yet."},
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )
