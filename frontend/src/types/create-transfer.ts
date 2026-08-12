export const SUPPORTED_CURRENCIES = ["NGN", "GBP", "USD"] as const;

export type TransferCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export type CreateTransferRequest = {
  amount: string;
  currency: TransferCurrency;
  recipient_ref: string;
};

export type CreatedTransfer = CreateTransferRequest & {
  id: string;
  reference: string;
  status: import("@/types/transfer").TransferStatus;
  provider_transfer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DrfErrorBody = {
  detail?: string;
  amount?: string[];
  currency?: string[];
  recipient_ref?: string[];
  non_field_errors?: string[];
};
