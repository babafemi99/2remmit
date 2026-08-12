from decimal import Decimal

from rest_framework import serializers

from transfers.models import Transfer


class TransferCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )

    currency = serializers.ChoiceField(
        choices=Transfer.Currency,
    )

    recipient_ref = serializers.CharField(
        max_length=255,
        trim_whitespace=True,
    )


class TransferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transfer
        fields = [
            "id",
            "reference",
            "amount",
            "currency",
            "recipient_ref",
            "status",
            "provider_transfer_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
