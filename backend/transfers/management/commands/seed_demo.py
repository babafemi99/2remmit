from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from transfers.models import Transfer
from transfers.services import (
    cancel_transfer,
    complete_transfer,
    create_transfer,
    fail_transfer,
    submit_transfer,
)


DEMO_TRANSFERS = (
    ("DEMO-PENDING-001", Decimal("250000.00"), "NGN", "pending"),
    ("DEMO-PROCESSING-001", Decimal("1250.00"), "GBP", "processing"),
    ("DEMO-COMPLETED-001", Decimal("4800.00"), "USD", "completed"),
    ("DEMO-FAILED-001", Decimal("750.00"), "GBP", "failed"),
    ("DEMO-CANCELLED-001", Decimal("90000.00"), "NGN", "cancelled"),
)


class Command(BaseCommand):
    help = "Create the idempotent local 2Remit demo data set."

    def handle(self, *args, **options):
        created = 0
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(%s)",
                    [0x3252454D4954],
                )

            existing = set(
                Transfer.objects.filter(
                    recipient_ref__in=[row[0] for row in DEMO_TRANSFERS]
                ).values_list("recipient_ref", flat=True)
            )
            for recipient_ref, amount, currency, target_status in DEMO_TRANSFERS:
                if recipient_ref in existing:
                    continue
                transfer = create_transfer(
                    amount=amount,
                    currency=currency,
                    recipient_ref=recipient_ref,
                )
                if target_status == Transfer.Status.PROCESSING:
                    submit_transfer(transfer.pk)
                elif target_status == Transfer.Status.COMPLETED:
                    submit_transfer(transfer.pk)
                    complete_transfer(transfer.pk)
                elif target_status == Transfer.Status.FAILED:
                    submit_transfer(transfer.pk)
                    fail_transfer(transfer.pk)
                elif target_status == Transfer.Status.CANCELLED:
                    cancel_transfer(transfer.pk)
                created += 1

        total = Transfer.objects.filter(
            recipient_ref__in=[row[0] for row in DEMO_TRANSFERS]
        ).count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Demo seed complete: created={created} total={total}"
            )
        )
