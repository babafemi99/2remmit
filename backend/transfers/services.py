from decimal import Decimal
from uuid import UUID, uuid4

from django.db import transaction

from transfers.exceptions import InvalidTransition
from transfers.idempotency import hash_transfer_request
from transfers.models import Transfer, IdempotencyRecord


def generate_provider_transfer_id() -> str:
    return f"PRV-{uuid4().hex.upper()}"


@transaction.atomic
def submit_transfer(transfer_id: UUID) -> Transfer:
    transfer = (
        Transfer.objects
        .select_for_update()
        .get(pk=transfer_id)
    )

    if transfer.status != Transfer.Status.PENDING:
        raise InvalidTransition(
            f"Cannot submit transfer from {transfer.status}"
        )

    transfer.status = Transfer.Status.PROCESSING
    transfer.provider_transfer_id = generate_provider_transfer_id()

    transfer.save(
        update_fields=[
            "status",
            "provider_transfer_id",
            "updated_at",
        ]
    )

    return transfer


@transaction.atomic
def cancel_transfer(transfer_id: UUID) -> Transfer:
    transfer = (
        Transfer.objects
        .select_for_update()
        .get(pk=transfer_id)
    )

    if transfer.status != Transfer.Status.PENDING:
        raise InvalidTransition(
            f"Cannot cancel transfer from {transfer.status}"
        )

    transfer.status = Transfer.Status.CANCELLED

    transfer.save(
        update_fields=[
            "status",
            "updated_at",
        ]
    )

    return transfer



@transaction.atomic
def complete_transfer(transfer_id: UUID) -> Transfer:
    transfer = (
        Transfer.objects
        .select_for_update()
        .get(pk=transfer_id)
    )

    if transfer.status != Transfer.Status.PROCESSING:
        raise InvalidTransition(
            f"Cannot complete transfer from {transfer.status}"
        )

    transfer.status = Transfer.Status.COMPLETED

    transfer.save(
        update_fields=[
            "status",
            "updated_at",
        ]
    )

    return transfer


@transaction.atomic
def fail_transfer(transfer_id: UUID) -> Transfer:
    transfer = (
        Transfer.objects
        .select_for_update()
        .get(pk=transfer_id)
    )

    if transfer.status != Transfer.Status.PROCESSING:
        raise InvalidTransition(
            f"Cannot fail transfer from {transfer.status}"
        )

    transfer.status = Transfer.Status.FAILED

    transfer.save(
        update_fields=[
            "status",
            "updated_at",
        ]
    )

    return transfer


@transaction.atomic
def create_transfer(*, amount: Decimal, currency: str, recipient_ref: str) -> Transfer:
    return Transfer.objects.create(
        amount=amount,
        currency=currency,
        recipient_ref=recipient_ref,
    )