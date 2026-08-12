import hashlib
import hmac
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from uuid import uuid4

from django.utils import timezone


SIMULATED_FAILURE_REASON = "simulated_provider_failure"


@dataclass(frozen=True)
class SimulatedProviderDelivery:
    event_id: str
    provider_event: str
    webhook_status: int


class ProviderDeliveryError(Exception):
    def __init__(self, webhook_status: int | None = None):
        self.webhook_status = webhook_status
        super().__init__("Provider webhook delivery failed")


def build_provider_event(
    *,
    provider_transfer_id: str,
    provider_event: str,
) -> tuple[dict, bytes]:
    event_id = f"evt_sim_{uuid4().hex}"
    data = {"provider_transfer_id": provider_transfer_id}

    if provider_event == "transfer.failed":
        data["reason"] = SIMULATED_FAILURE_REASON

    payload = {
        "event_id": event_id,
        "event": provider_event,
        "occurred_at": timezone.now().isoformat().replace("+00:00", "Z"),
        "data": data,
    }
    raw_body = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")

    return payload, raw_body


def sign_provider_event(*, raw_body: bytes, secret: str) -> str:
    digest = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={digest}"


def deliver_provider_event(
    *,
    webhook_url: str,
    secret: str,
    provider_transfer_id: str,
    provider_event: str,
) -> SimulatedProviderDelivery:
    payload, raw_body = build_provider_event(
        provider_transfer_id=provider_transfer_id,
        provider_event=provider_event,
    )
    signature = sign_provider_event(raw_body=raw_body, secret=secret)
    request = urllib.request.Request(
        webhook_url,
        data=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Provider-Signature": signature,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            webhook_status = response.status
    except urllib.error.HTTPError as exc:
        raise ProviderDeliveryError(webhook_status=exc.code) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ProviderDeliveryError() from exc

    if not 200 <= webhook_status < 300:
        raise ProviderDeliveryError(webhook_status=webhook_status)

    return SimulatedProviderDelivery(
        event_id=payload["event_id"],
        provider_event=provider_event,
        webhook_status=webhook_status,
    )
