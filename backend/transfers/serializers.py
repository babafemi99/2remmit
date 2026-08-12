from decimal import Decimal

from rest_framework import serializers

from transfers.models import Transfer, TransferActivity


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


class TransferActivitySerializer(serializers.ModelSerializer):
    event_id = serializers.CharField(
        source="provider_event.event_id",
        allow_null=True,
        read_only=True,
    )
    message = serializers.SerializerMethodField()

    MESSAGES = {
        TransferActivity.Type.CREATED: "Transfer created",
        TransferActivity.Type.SUBMITTED: "Submitted to provider",
        TransferActivity.Type.CANCELLED: "Transfer cancelled",
        TransferActivity.Type.COMPLETED: "Provider completed transfer",
        TransferActivity.Type.FAILED: "Provider reported transfer failure",
    }

    class Meta:
        model = TransferActivity
        fields = [
            "id",
            "type",
            "source",
            "message",
            "previous_status",
            "new_status",
            "event_id",
            "created_at",
        ]
        read_only_fields = fields

    def get_message(self, activity):
        return self.MESSAGES[activity.type]


class ProviderWebhookDataSerializer(serializers.Serializer):
    provider_transfer_id = serializers.CharField(
        max_length=255,
        trim_whitespace=True,
    )
    reason = serializers.CharField(
        required=False,
        allow_blank=False,
        max_length=255,
        trim_whitespace=True,
    )


class ProviderWebhookSerializer(serializers.Serializer):
    class Event:
        COMPLETED = "transfer.completed"
        FAILED = "transfer.failed"

        CHOICES = (COMPLETED, FAILED)

    event_id = serializers.CharField(
        max_length=255,
        trim_whitespace=True,
    )
    event = serializers.ChoiceField(choices=Event.CHOICES)
    occurred_at = serializers.DateTimeField()
    data = ProviderWebhookDataSerializer()

    def validate(self, attrs):
        if (
            attrs["event"] == self.Event.COMPLETED
            and "reason" in attrs["data"]
        ):
            raise serializers.ValidationError(
                {"data": {"reason": "Reason is only valid for failed transfers."}}
            )

        return attrs
