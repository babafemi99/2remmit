import hashlib
import json
from decimal import Decimal

from django.db import IntegrityError, transaction

from transfers.exceptions import IdempotencyConflict, IdempotencyInProgress
from transfers.models import IdempotencyRecord
from transfers.serializers import TransferSerializer
from transfers.services import create_transfer


def canonical_transfer_payload(*,amount: Decimal,currency: str,recipient_ref: str) -> dict[str, str]:
    return {
        "amount": format(amount, ".2f"),
        "currency": currency.upper(),
        "recipient_ref": recipient_ref.strip(),
    }


def hash_transfer_request( *,amount: Decimal,currency: str,recipient_ref: str) -> str:
    payload = canonical_transfer_payload(
        amount=amount,
        currency=currency,
        recipient_ref=recipient_ref,
    )

    canonical_json = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        canonical_json.encode("utf-8")
    ).hexdigest()


@transaction.atomic
def create_transfer_idempotently(
    *,
    idempotency_key: str,
    amount: Decimal,
    currency: str,
    recipient_ref: str,
):
    request_hash = hash_transfer_request(
        amount=amount,
        currency=currency,
        recipient_ref=recipient_ref,
    )

    try:
        with transaction.atomic():
            record = IdempotencyRecord.objects.create(
                key=idempotency_key,
                request_hash=request_hash,
                request_path="/api/transfers/",
                action="create_transfer",
                status=IdempotencyRecord.Status.PROCESSING,
            )

        created = True

    except IntegrityError:
        record = (
            IdempotencyRecord.objects
            .select_for_update()
            .get(key=idempotency_key)
        )

        created = False

    if not created:
        if record.request_hash != request_hash:
            raise IdempotencyConflict(
                "Idempotency key was already used with a different request"
            )

        if record.status == IdempotencyRecord.Status.COMPLETED:
            return record.response_body, record.response_code

        raise IdempotencyInProgress(
            "A request with this idempotency key is already being processed"
        )

    transfer = create_transfer(
        amount=amount,
        currency=currency,
        recipient_ref=recipient_ref,
    )

    response_body = TransferSerializer(transfer).data

    record.transfer = transfer
    record.status = IdempotencyRecord.Status.COMPLETED
    record.response_code = 201
    record.response_body = response_body

    record.save(
        update_fields=[
            "transfer",
            "status",
            "response_code",
            "response_body",
            "updated_at",
        ]
    )

    return response_body, 201