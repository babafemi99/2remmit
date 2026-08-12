import type {
  CreateTransferRequest,
  DrfErrorBody,
} from "@/types/create-transfer";
import {
  ACTIVITY_TYPES,
  type TransferActivity,
  type TransferDetail,
} from "@/types/transfer-detail";
import { TRANSFER_STATUSES } from "@/types/transfer";
import { SUPPORTED_CURRENCIES } from "@/types/create-transfer";

export class TransferApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: DrfErrorBody,
  ) {
    super(body.detail ?? "The transfer could not be created.");
    this.name = "TransferApiError";
  }
}

export function isTransferDetail(value: unknown): value is TransferDetail {
  if (!value || typeof value !== "object") return false;
  const transfer = value as Record<string, unknown>;
  return (
    typeof transfer.id === "string" &&
    typeof transfer.reference === "string" &&
    typeof transfer.amount === "string" &&
    SUPPORTED_CURRENCIES.includes(transfer.currency as never) &&
    typeof transfer.recipient_ref === "string" &&
    TRANSFER_STATUSES.includes(transfer.status as never) &&
    (transfer.provider_transfer_id === null ||
      typeof transfer.provider_transfer_id === "string") &&
    typeof transfer.created_at === "string" &&
    typeof transfer.updated_at === "string"
  );
}

function isTransferActivity(value: unknown): value is TransferActivity {
  if (!value || typeof value !== "object") return false;
  const activity = value as Record<string, unknown>;
  return (
    typeof activity.id === "number" &&
    ACTIVITY_TYPES.includes(activity.type as never) &&
    ["api", "provider", "system"].includes(String(activity.source)) &&
    typeof activity.message === "string" &&
    (activity.previous_status === null ||
      TRANSFER_STATUSES.includes(activity.previous_status as never)) &&
    TRANSFER_STATUSES.includes(activity.new_status as never) &&
    (activity.event_id === null || typeof activity.event_id === "string") &&
    typeof activity.created_at === "string"
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body = await readJson(response);
  if (!response.ok) {
    throw new TransferApiError(
      response.status,
      body && typeof body === "object" ? (body as DrfErrorBody) : {},
    );
  }
  return body;
}

export async function createTransfer(
  request: CreateTransferRequest,
  idempotencyKey: string,
) {
  const response = await fetch("/api/transfers/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(request),
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new TransferApiError(
      response.status,
      body && typeof body === "object" ? (body as DrfErrorBody) : {},
    );
  }
  if (!isTransferDetail(body)) {
    throw new TransferApiError(502, {
      detail: "The server returned an unexpected transfer response.",
    });
  }
  return body;
}

export async function getTransfer(transferId: string) {
  const body = await requestJson(
    `/api/transfers/${encodeURIComponent(transferId)}/`,
  );
  if (!isTransferDetail(body)) {
    throw new TransferApiError(502, {
      detail: "The server returned an invalid transfer.",
    });
  }
  return body;
}

export async function getTransfers() {
  const body = await requestJson("/api/transfers");
  if (!Array.isArray(body) || !body.every(isTransferDetail)) {
    throw new TransferApiError(502, {
      detail: "The server returned an invalid transfer list.",
    });
  }
  return body;
}

export type SimulatorAction = "simulate-success" | "simulate-failure";

export type SimulatorResult = {
  detail: string;
  event_id: string;
  event: "transfer.completed" | "transfer.failed";
  webhook_status: number;
};

export async function simulateProviderEvent(
  transferId: string,
  action: SimulatorAction,
) {
  const body = await requestJson(
    `/api/dev/transfers/${encodeURIComponent(transferId)}/${action}`,
    { method: "POST" },
  );
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as SimulatorResult).detail !== "string" ||
    typeof (body as SimulatorResult).event_id !== "string" ||
    !["transfer.completed", "transfer.failed"].includes(
      (body as SimulatorResult).event,
    ) ||
    typeof (body as SimulatorResult).webhook_status !== "number"
  ) {
    throw new TransferApiError(502, {
      detail: "The simulator returned an invalid response.",
    });
  }
  return body as SimulatorResult;
}

export async function getTransferActivities(transferId: string) {
  const body = await requestJson(
    `/api/transfers/${encodeURIComponent(transferId)}/activities/`,
  );
  if (!Array.isArray(body) || !body.every(isTransferActivity)) {
    throw new TransferApiError(502, {
      detail: "The server returned invalid activity history.",
    });
  }
  return body;
}

async function mutateTransfer(transferId: string, action: "submit" | "cancel") {
  const body = await requestJson(
    `/api/transfers/${encodeURIComponent(transferId)}/${action}/`,
    { method: "POST" },
  );
  if (!isTransferDetail(body)) {
    throw new TransferApiError(502, {
      detail: "The server returned an invalid transfer.",
    });
  }
  return body;
}

export const submitTransfer = (transferId: string) =>
  mutateTransfer(transferId, "submit");
export const cancelTransfer = (transferId: string) =>
  mutateTransfer(transferId, "cancel");
