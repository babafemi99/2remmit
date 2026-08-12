import hashlib
import json
from decimal import Decimal


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