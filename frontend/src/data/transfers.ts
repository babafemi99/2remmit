import type { Transfer } from "@/types/transfer";
import { getTransfers } from "@/lib/api/transfers";

export const TRANSFER_FIXTURES: readonly Transfer[] = [
  {
    id: "8n4k2p",
    reference: "TRF-8N4K2P",
    recipientReference: "ACME-SUPPLIER-01",
    amount: 250000,
    currency: "NGN",
    status: "processing",
    updatedLabel: "2 min ago",
  },
  {
    id: "7m3j9q",
    reference: "TRF-7M3J9Q",
    recipientReference: "TUITION-LEE-24",
    amount: 1250,
    currency: "GBP",
    status: "pending",
    updatedLabel: "12 min ago",
  },
  {
    id: "6c8l1r",
    reference: "TRF-6C8L1R",
    recipientReference: "INV-100284",
    amount: 4800,
    currency: "USD",
    status: "completed",
    updatedLabel: "Today, 14:32",
  },
  {
    id: "5b2h7t",
    reference: "TRF-5B2H7T",
    recipientReference: "VENDOR-UK-09",
    amount: 750,
    currency: "GBP",
    status: "failed",
    updatedLabel: "Yesterday",
  },
] as const;

export async function loadTransfers(
  shouldFail = false,
  options: { cursor?: string | null; query?: string; status?: string } = {},
): Promise<{ transfers: Transfer[]; nextCursor: string | null }> {
  if (shouldFail) {
    throw new Error("The transfer list could not be loaded.");
  }

  const page = await getTransfers(options);
  return {
    nextCursor: page.nextCursor,
    transfers: page.results.map((transfer) => ({
      id: transfer.id,
      reference: transfer.reference,
      recipientReference: transfer.recipient_ref,
      amount: Number(transfer.amount),
      currency: transfer.currency,
      status: transfer.status,
      updatedLabel: formatUpdatedAt(transfer.updated_at),
    })),
  };
}

function formatUpdatedAt(value: string) {
  const timestamp = new Date(value);
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp.getTime()) / 60_000),
  );
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60)
    return `${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}
