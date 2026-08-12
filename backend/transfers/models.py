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