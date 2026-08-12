import secrets
import string
import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


def generate_transfer_reference():
    alphabet = string.ascii_uppercase + string.digits
    value = "".join(secrets.choice(alphabet) for _ in range(10))

    return f"TRF-{value}"


class Transfer(models.Model):
    class Currency(models.TextChoices):
            NGN = "NGN"
            USD = "USD"
            GBP = "GBP"

    class Status(models.TextChoices):
        PENDING = "pending"
        PROCESSING = "processing"
        COMPLETED = "completed"
        FAILED = "failed"
        CANCELLED = "cancelled"

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="transfer_amount_greater_than_zero",
            ),
        ]

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid7,
        editable=False,
    )

    reference = models.CharField(
        max_length=14,
        default=generate_transfer_reference,
        unique=True,
        editable=False,
    )

    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    currency = models.CharField(
        max_length=3,
        choices=Currency,
    )

    recipient_ref = models.CharField(
        max_length=255,
    )

    status = models.CharField(
        max_length=10,
        choices=Status,
        default=Status.PENDING,
    )

    provider_transfer_id = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )


class IdempotencyRecord(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "processing"
        COMPLETED = "completed"
        FAILED = "failed"

    key = models.CharField(
        max_length=255,
        unique=True,
    )

    request_hash = models.CharField(
        max_length=64,
    )

    request_path = models.CharField(
        max_length=255,
    )

    action = models.CharField(
        max_length=64,
    )

    status = models.CharField(
        max_length=10,
        choices=Status,
        default=Status.PROCESSING,
    )

    response_code = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
    )

    response_body = models.JSONField(
        null=True,
        blank=True,
    )

    transfer = models.OneToOneField(
        Transfer,
        on_delete=models.CASCADE,
        related_name="idempotency_record",
        null=True,
        blank=True,
    )

    error_message = models.TextField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )


class WebhookEvent(models.Model):
    class ProviderStatus(models.TextChoices):
        COMPLETED = "completed"
        FAILED = "failed"

    class ProcessingOutcome(models.TextChoices):
        PROCESSED = "processed"
        UNKNOWN_TRANSFER = "unknown_transfer"
        INVALID_TRANSITION = "invalid_transition"
        FAILED = "failed"

    event_id = models.CharField(
        max_length=255,
        unique=True,
    )

    provider_transfer_id = models.CharField(
        max_length=255,
        db_index=True,
    )

    provider_status = models.CharField(
        max_length=10,
        choices=ProviderStatus,
    )

    occurred_at = models.DateTimeField()

    received_at = models.DateTimeField(
        auto_now_add=True,
    )

    processed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    processing_outcome = models.CharField(
        max_length=20,
        choices=ProcessingOutcome,
        null=True,
        blank=True,
    )

    error_message = models.TextField(
        null=True,
        blank=True,
    )

    transfer = models.ForeignKey(
        Transfer,
        on_delete=models.SET_NULL,
        related_name="webhook_events",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-received_at"]


class TransferActivity(models.Model):
    class Type(models.TextChoices):
        CREATED = "created", "Created"
        SUBMITTED = "submitted", "Submitted"
        CANCELLED = "cancelled", "Cancelled"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    class Source(models.TextChoices):
        API = "api", "API"
        PROVIDER = "provider", "Provider"
        SYSTEM = "system", "System"

    transfer = models.ForeignKey(
        Transfer,
        on_delete=models.PROTECT,
        related_name="activities",
    )

    type = models.CharField(
        max_length=16,
        choices=Type,
    )

    source = models.CharField(
        max_length=16,
        choices=Source,
    )

    previous_status = models.CharField(
        max_length=10,
        choices=Transfer.Status,
        null=True,
        blank=True,
    )

    new_status = models.CharField(
        max_length=10,
        choices=Transfer.Status,
    )

    provider_event = models.OneToOneField(
        WebhookEvent,
        on_delete=models.SET_NULL,
        related_name="transfer_activity",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(
                fields=["transfer", "id"],
                name="activity_transfer_cursor_idx",
            ),
        ]
