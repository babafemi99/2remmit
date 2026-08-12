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

export type CursorPage<T> = {
  results: T[];
  nextCursor: string | null;
};

function cursorFromUrl(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  try {
    return new URL(value, "http://local").searchParams.get("cursor");
  } catch {
    return undefined;
  }
}

function parseCursorPage<T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): CursorPage<T> | null {
  if (Array.isArray(value) && value.every(predicate)) {
    return { results: value, nextCursor: null };
  }
  if (!value || typeof value !== "object") return null;
  const page = value as Record<string, unknown>;
  const nextCursor = cursorFromUrl(page.next);
  if (
    !Array.isArray(page.results) ||
    !page.results.every(predicate) ||
    nextCursor === undefined
  )
    return null;
  return { results: page.results, nextCursor };
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

export async function getTransfers(
  options: {
    cursor?: string | null;
    query?: string;
    status?: string;
  } = {},
) {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.query) params.set("query", options.query);
  if (options.status && options.status !== "all")
    params.set("status", options.status);
  const body = await requestJson(`/api/transfers?${params.toString()}`);
  const page = parseCursorPage(body, isTransferDetail);
  if (!page) {
    throw new TransferApiError(502, {
      detail: "The server returned an invalid transfer list.",
    });
  }
  return page;
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

export async function getTransferActivities(
  transferId: string,
  cursor?: string | null,
) {
  const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const body = await requestJson(
    `/api/transfers/${encodeURIComponent(transferId)}/activities/${params}`,
  );
  const page = parseCursorPage(body, isTransferActivity);
  if (!page) {
    throw new TransferApiError(502, {
      detail: "The server returned invalid activity history.",
    });
  }
  return page;
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
