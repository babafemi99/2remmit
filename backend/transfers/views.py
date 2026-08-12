from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from transfers.serializers import TransferCreateSerializer, TransferSerializer
from transfers.services import create_transfer


class TransferListCreateView(APIView):
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
