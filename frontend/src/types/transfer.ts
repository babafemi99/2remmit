export const TRANSFER_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export type Transfer = {
  id: string;
  reference: string;
  recipientReference: string;
  amount: number;
  currency: "NGN" | "GBP" | "USD";
  status: TransferStatus;
  updatedLabel: string;
};
