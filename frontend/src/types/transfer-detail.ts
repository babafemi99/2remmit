import type { TransferCurrency } from "./create-transfer";
import type { TransferStatus } from "./transfer";

export type TransferDetail = {
  id: string;
  reference: string;
  amount: string;
  currency: TransferCurrency;
  recipient_ref: string;
  status: TransferStatus;
  provider_transfer_id: string | null;
  created_at: string;
  updated_at: string;
};

export const ACTIVITY_TYPES = [
  "created",
  "submitted",
  "cancelled",
  "completed",
  "failed",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type TransferActivity = {
  id: number;
  type: ActivityType;
  source: "api" | "provider" | "system";
  message: string;
  previous_status: TransferStatus | null;
  new_status: TransferStatus;
  event_id: string | null;
  created_at: string;
};

export type TransferActivityEvent = TransferActivity & {
  transfer_id: string;
};
