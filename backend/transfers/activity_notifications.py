import asyncio
from dataclasses import dataclass, field
from threading import Lock
from uuid import UUID


@dataclass(eq=False)
class ActivitySubscription:
    transfer_id: UUID
    loop: asyncio.AbstractEventLoop
    event: asyncio.Event = field(default_factory=asyncio.Event)


class ActivityNotifier:
    def __init__(self):
        self._lock = Lock()
        self._subscribers: dict[UUID, set[ActivitySubscription]] = {}

    def subscribe(self, transfer_id: UUID) -> ActivitySubscription:
        subscription = ActivitySubscription(
            transfer_id=transfer_id,
            loop=asyncio.get_running_loop(),
        )
        with self._lock:
            self._subscribers.setdefault(transfer_id, set()).add(subscription)
        return subscription

    def unsubscribe(self, subscription: ActivitySubscription) -> None:
        with self._lock:
            subscribers = self._subscribers.get(subscription.transfer_id)
            if subscribers is None:
                return
            subscribers.discard(subscription)
            if not subscribers:
                self._subscribers.pop(subscription.transfer_id, None)

    def notify(self, transfer_id: UUID) -> None:
        with self._lock:
            subscriptions = tuple(self._subscribers.get(transfer_id, ()))

        stale = []
        for subscription in subscriptions:
            if subscription.loop.is_closed():
                stale.append(subscription)
                continue
            try:
                subscription.loop.call_soon_threadsafe(subscription.event.set)
            except RuntimeError:
                stale.append(subscription)

        for subscription in stale:
            self.unsubscribe(subscription)

    def subscriber_count(self, transfer_id: UUID | None = None) -> int:
        with self._lock:
            if transfer_id is not None:
                return len(self._subscribers.get(transfer_id, ()))
            return sum(len(value) for value in self._subscribers.values())


activity_notifier = ActivityNotifier()
