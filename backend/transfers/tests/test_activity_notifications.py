import asyncio
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from django.test import SimpleTestCase

from transfers.activity_notifications import ActivityNotifier


class ActivityNotifierTests(SimpleTestCase):
    async def test_sync_thread_wakes_multiple_subscribers_for_one_transfer(self):
        notifier = ActivityNotifier()
        transfer_id = uuid4()
        first = notifier.subscribe(transfer_id)
        second = notifier.subscribe(transfer_id)

        with ThreadPoolExecutor(max_workers=1) as executor:
            await asyncio.get_running_loop().run_in_executor(
                executor, notifier.notify, transfer_id
            )

        await asyncio.wait_for(first.event.wait(), timeout=1)
        await asyncio.wait_for(second.event.wait(), timeout=1)
        self.assertEqual(notifier.subscriber_count(transfer_id), 2)

        notifier.unsubscribe(first)
        notifier.unsubscribe(second)
        self.assertEqual(notifier.subscriber_count(), 0)

    async def test_notification_is_scoped_to_transfer(self):
        notifier = ActivityNotifier()
        first = notifier.subscribe(uuid4())
        second = notifier.subscribe(uuid4())

        notifier.notify(first.transfer_id)
        await asyncio.wait_for(first.event.wait(), timeout=1)
        await asyncio.sleep(0)
        self.assertFalse(second.event.is_set())

        notifier.unsubscribe(first)
        notifier.unsubscribe(second)
