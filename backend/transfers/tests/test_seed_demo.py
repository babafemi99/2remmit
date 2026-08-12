from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from transfers.models import Transfer, TransferActivity
from transfers.management.commands.seed_demo import DEMO_TRANSFERS


class SeedDemoCommandTests(TestCase):
    def test_seed_is_complete_and_idempotent(self):
        first_output = StringIO()
        call_command("seed_demo", stdout=first_output)

        self.assertEqual(Transfer.objects.count(), 5)
        self.assertEqual(TransferActivity.objects.count(), 11)
        self.assertCountEqual(
            Transfer.objects.values_list("status", flat=True),
            [row[3] for row in DEMO_TRANSFERS],
        )

        identities = list(
            Transfer.objects.order_by("recipient_ref").values_list(
                "pk", "recipient_ref", "status"
            )
        )
        second_output = StringIO()
        call_command("seed_demo", stdout=second_output)

        self.assertEqual(Transfer.objects.count(), 5)
        self.assertEqual(TransferActivity.objects.count(), 11)
        self.assertEqual(
            list(
                Transfer.objects.order_by("recipient_ref").values_list(
                    "pk", "recipient_ref", "status"
                )
            ),
            identities,
        )
        self.assertIn("created=0 total=5", second_output.getvalue())
