"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConsoleShell } from "@/components/transfers/console-shell";
import { useTransferActivityStream } from "@/hooks/use-transfer-activity-stream";
import {
  cancelTransfer,
  getTransfer,
  getTransferActivities,
  submitTransfer,
  TransferApiError,
} from "@/lib/api/transfers";
import type {
  TransferActivity,
  TransferActivityEvent,
  TransferDetail,
} from "@/types/transfer-detail";

import { ActivityTimeline } from "./activity-timeline";
import { ConfirmationDialog } from "./confirmation-dialog";
import { TransferActions } from "./transfer-actions";
import { TransferAmountSummary } from "./transfer-amount-summary";
import { TransferDetailHeader } from "./transfer-detail-header";
import {
  TransferDetailError,
  TransferDetailLoading,
  TransferNotFound,
} from "./transfer-detail-states";
import { TransferLifecycle } from "./transfer-lifecycle";
import { TransferMetadata } from "./transfer-metadata";

type InitialState = "loading" | "ready" | "not-found" | "error";
type Dialog = "submit" | "cancel" | null;

function safeMessage(error: unknown, fallback: string) {
  return error instanceof TransferApiError ? error.message : fallback;
}

function mergeActivities(
  current: TransferActivity[],
  incoming: TransferActivity[],
) {
  const byId = new Map(current.map((activity) => [activity.id, activity]));
  for (const activity of incoming) byId.set(activity.id, activity);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function canApplyStatus(
  current: TransferDetail["status"],
  next: TransferDetail["status"],
) {
  if (["completed", "failed", "cancelled"].includes(current))
    return current === next;
  if (current === "processing")
    return ["processing", "completed", "failed"].includes(next);
  return true;
}

export function TransferDetailScreen({ transferId }: { transferId: string }) {
  const [initialState, setInitialState] = useState<InitialState>("loading");
  const [transfer, setTransfer] = useState<TransferDetail | null>(null);
  const [activities, setActivities] = useState<TransferActivity[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityNextCursor, setActivityNextCursor] = useState<string | null>(
    null,
  );
  const [initialError, setInitialError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [actionError, setActionError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [mutating, setMutating] = useState(false);
  const mutationRef = useRef(false);

  const loadActivities = useCallback(async () => {
    setActivityLoading(true);
    try {
      const page = await getTransferActivities(transferId);
      setActivities((current) => mergeActivities(current, page.results));
      setActivityNextCursor(page.nextCursor);
      setActivityError("");
      setActivityLoaded(true);
    } catch (error) {
      setActivityError(
        safeMessage(error, "Activity history is temporarily unavailable."),
      );
      setActivityLoaded(false);
    } finally {
      setActivityLoading(false);
    }
  }, [transferId]);

  const loadEarlierActivities = useCallback(async () => {
    if (!activityNextCursor || activityLoadingMore) return;
    setActivityLoadingMore(true);
    try {
      const page = await getTransferActivities(transferId, activityNextCursor);
      setActivities((current) => mergeActivities(current, page.results));
      setActivityNextCursor(page.nextCursor);
    } catch (error) {
      setActivityError(
        safeMessage(error, "Earlier activity is temporarily unavailable."),
      );
    } finally {
      setActivityLoadingMore(false);
    }
  }, [activityLoadingMore, activityNextCursor, transferId]);

  const load = useCallback(async () => {
    setInitialState("loading");
    setInitialError("");
    try {
      const detail = await getTransfer(transferId);
      setTransfer(detail);
      setInitialState("ready");
      await loadActivities();
    } catch (error) {
      if (error instanceof TransferApiError && error.status === 404)
        setInitialState("not-found");
      else {
        const message = safeMessage(
          error,
          "The transfer service is temporarily unavailable.",
        );
        setInitialError(message);
        toast.error("Couldn’t load transfer", {
          description: message,
        });
        setInitialState("error");
      }
    }
  }, [loadActivities, transferId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const refreshDetail = useCallback(async () => {
    try {
      const detail = await getTransfer(transferId);
      setTransfer((current) =>
        !current || canApplyStatus(current.status, detail.status)
          ? detail
          : current,
      );
    } catch {
      /* durable activity remains visible; next refresh reconciles */
    }
  }, [transferId]);

  const onLiveActivity = useCallback(
    (activity: TransferActivityEvent) => {
      setActivities((current) => mergeActivities(current, [activity]));
      setTransfer((current) =>
        current && canApplyStatus(current.status, activity.new_status)
          ? {
              ...current,
              status: activity.new_status,
              updated_at: activity.created_at,
            }
          : current,
      );
      void refreshDetail();
    },
    [refreshDetail],
  );

  const cursor = useMemo(() => activities.at(-1)?.id ?? 0, [activities]);
  const liveState = useTransferActivityStream({
    transferId,
    enabled: initialState === "ready" && activityLoaded,
    cursor,
    onActivity: onLiveActivity,
  });

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshDetail(), loadActivities()]);
  }, [loadActivities, refreshDetail]);

  const mutate = async (kind: Exclude<Dialog, null>) => {
    if (mutationRef.current) return;
    mutationRef.current = true;
    setMutating(true);
    setActionError("");
    try {
      const updated =
        kind === "submit"
          ? await submitTransfer(transferId)
          : await cancelTransfer(transferId);
      setTransfer(updated);
      setDialog(null);
      toast.success(
        kind === "submit" ? "Transfer submitted" : "Transfer cancelled",
        {
          description:
            kind === "submit"
              ? "The mock provider is now processing this transfer."
              : "The transfer is now permanently cancelled.",
        },
      );
      await loadActivities();
    } catch (error) {
      const message = safeMessage(
        error,
        `The transfer could not be ${kind === "submit" ? "submitted" : "cancelled"}.`,
      );
      setActionError(message);
      setDialog(null);
      toast.error(
        kind === "submit" ? "Submission failed" : "Cancellation failed",
        { description: message },
      );
      if (error instanceof TransferApiError && error.status === 409)
        await refreshAll();
    } finally {
      mutationRef.current = false;
      setMutating(false);
    }
  };

  if (initialState === "loading") return <TransferDetailLoading />;
  if (initialState === "not-found") return <TransferNotFound />;
  if (initialState === "error")
    return (
      <TransferDetailError message={initialError} onRetry={() => void load()} />
    );
  if (!transfer) return null;

  return (
    <ConsoleShell>
      <section className="console-content transfer-detail-content">
        <TransferDetailHeader transfer={transfer} />
        <div className="sr-only" aria-live="polite">
          Transfer status is now {transfer.status}.
        </div>
        <TransferAmountSummary transfer={transfer} />
        <TransferLifecycle status={transfer.status} />
        <TransferActions
          status={transfer.status}
          disabled={mutating}
          error={actionError}
          onSubmit={() => setDialog("submit")}
          onCancel={() => setDialog("cancel")}
        />
        <TransferMetadata transfer={transfer} />
        <ActivityTimeline
          activities={activities}
          loading={activityLoading}
          state={activityLoaded ? liveState : "paused"}
          error={activityError}
          onRetry={() => void refreshAll()}
          hasMore={Boolean(activityNextCursor)}
          loadingMore={activityLoadingMore}
          onLoadMore={() => void loadEarlierActivities()}
        />
      </section>
      {dialog === "submit" ? (
        <ConfirmationDialog
          title="Submit this transfer?"
          description="Submitting sends this transfer to the mock provider. It cannot be cancelled afterwards."
          cancelLabel="Keep pending"
          confirmLabel="Submit transfer"
          busyLabel="Submitting…"
          busy={mutating}
          onClose={() => setDialog(null)}
          onConfirm={() => void mutate("submit")}
        />
      ) : null}
      {dialog === "cancel" ? (
        <ConfirmationDialog
          title="Cancel this transfer?"
          description="Cancellation is terminal. This transfer cannot be submitted or restored afterwards."
          cancelLabel="Keep transfer"
          confirmLabel="Cancel transfer"
          busyLabel="Cancelling…"
          destructive
          busy={mutating}
          onClose={() => setDialog(null)}
          onConfirm={() => void mutate("cancel")}
        />
      ) : null}
    </ConsoleShell>
  );
}
