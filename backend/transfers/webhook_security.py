import hashlib
import hmac


def verify_webhook_signature(
    *,
    payload: bytes,
    signature: str,
    secret: str,
) -> bool:
    prefix = "sha256="

    if not signature.startswith(prefix):
        return False

    received_digest = signature.removeprefix(prefix)

    if len(received_digest) != 64 or any(
        character not in "0123456789abcdef" for character in received_digest
    ):
        return False

    expected_digest = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(received_digest, expected_digest)
