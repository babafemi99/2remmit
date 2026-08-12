"use client";

import { useEffect, useRef, useState } from "react";

import {
  ACTIVITY_TYPES,
  type TransferActivityEvent,
} from "@/types/transfer-detail";
import { TRANSFER_STATUSES } from "@/types/transfer";

export type LiveState = "connecting" | "live" | "reconnecting" | "paused";

const RETRY_DELAYS = [1000, 2000, 5000];

export function parseActivityEvent(
  value: string,
): TransferActivityEvent | null {
  try {
    const event = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof event.transfer_id !== "string" ||
      typeof event.id !== "number" ||
      !ACTIVITY_TYPES.includes(event.type as never) ||
      !["api", "provider", "system"].includes(String(event.source)) ||
      typeof event.message !== "string" ||
      !TRANSFER_STATUSES.includes(event.new_status as never) ||
      !(
        event.previous_status === null ||
        TRANSFER_STATUSES.includes(event.previous_status as never)
      ) ||
      !(event.event_id === null || typeof event.event_id === "string") ||
      typeof event.created_at !== "string"
    )
      return null;
    return event as unknown as TransferActivityEvent;
  } catch {
    return null;
  }
}

export function useTransferActivityStream({
  transferId,
  enabled,
  cursor,
  onActivity,
}: {
  transferId: string;
  enabled: boolean;
  cursor: number;
  onActivity: (activity: TransferActivityEvent) => void;
}) {
  const [state, setState] = useState<LiveState>("connecting");
  const cursorRef = useRef(cursor);
  const callbackRef = useRef(onActivity);

  useEffect(() => {
    cursorRef.current = Math.max(cursorRef.current, cursor);
    callbackRef.current = onActivity;
  }, [cursor, onActivity]);

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let attempts = 0;

    const connect = () => {
      if (stopped) return;
      setState(attempts ? "reconnecting" : "connecting");
      source = new EventSource(
        `/api/transfers/${encodeURIComponent(transferId)}/activities/stream/?after=${cursorRef.current}`,
      );
      source.onopen = () => {
        attempts = 0;
        setState("live");
      };
      source.addEventListener("transfer.activity", (rawEvent) => {
        const activity = parseActivityEvent((rawEvent as MessageEvent).data);
        if (!activity || activity.transfer_id !== transferId) return;
        if (activity.id <= cursorRef.current) return;
        cursorRef.current = activity.id;
        callbackRef.current(activity);
      });
      source.onerror = () => {
        source?.close();
        source = null;
        if (stopped) return;
        if (attempts >= RETRY_DELAYS.length) {
          setState("paused");
          return;
        }
        const delay = RETRY_DELAYS[attempts++];
        setState("reconnecting");
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [enabled, transferId]);

  return state;
}
