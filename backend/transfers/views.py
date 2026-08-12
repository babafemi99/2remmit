from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from transfers.exceptions import InvalidTransition
from transfers.models import Transfer
from transfers.serializers import TransferCreateSerializer, TransferSerializer
from transfers.services import (
    cancel_transfer,
    create_transfer,
    submit_transfer,
)


class TransferListCreateView(APIView):
    # noinspection PyMethodMayBeStatic
    def get(self, _request):
        transfers = Transfer.objects.order_by("-created_at")
        output = TransferSerializer(transfers, many=True)

        return Response(output.data)

    # noinspection PyMethodMayBeStatic
    def post(self, request):
        serializer = TransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        transfer = create_transfer(**serializer.validated_data)
        output = TransferSerializer(transfer)

        return Response(
            output.data,
            status=status.HTTP_201_CREATED,
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
        except InvalidTransition as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(TransferSerializer(transfer).data)


class ProviderWebhookView(APIView):
    # noinspection PyMethodMayBeStatic
    def post(self, _request):
        return Response(
            {"detail": "Webhook handling not implemented yet."},
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )
