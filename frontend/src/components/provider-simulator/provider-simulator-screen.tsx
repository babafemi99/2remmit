"use client";

import {
  ArrowClockwise,
  ArrowLeft,
  CheckCircle,
  Flask,
  ArrowSquareOut,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmationDialog } from "@/components/transfer-detail/confirmation-dialog";
import { ConsoleShell } from "@/components/transfers/console-shell";
import { BrandedLoader } from "@/components/transfers/transfer-states";
import {
  getTransfers,
  simulateProviderEvent,
  type SimulatorAction,
  type SimulatorResult,
  TransferApiError,
} from "@/lib/api/transfers";
import type { TransferDetail } from "@/types/transfer-detail";

type LoadState = "loading" | "ready" | "error";

function safeMessage(error: unknown) {
  return error instanceof TransferApiError
    ? error.message
    : "The provider simulator is temporarily unavailable.";
}

export function ProviderSimulatorScreen({
  victoriaLogsUrl = "http://localhost:9428/select/vmui/",
}: {
  victoriaLogsUrl?: string;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [transfers, setTransfers] = useState<TransferDetail[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [dialog, setDialog] = useState<SimulatorAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SimulatorResult | null>(null);
  const requestInFlight = useRef(false);

  const load = useCallback(async () => {
    setLoadState("loading");
    setError("");
    try {
      const processing = (
        await getTransfers({ status: "processing" })
      ).results.filter((transfer) => transfer.status === "processing");
      setTransfers(processing);
      setSelectedId((current) =>
        processing.some((transfer) => transfer.id === current)
          ? current
          : (processing[0]?.id ?? ""),
      );
      setLoadState("ready");
    } catch (loadError) {
      setError(safeMessage(loadError));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const selected = useMemo(
    () => transfers.find((transfer) => transfer.id === selectedId) ?? null,
    [selectedId, transfers],
  );

  const simulate = async (action: SimulatorAction) => {
    if (!selected || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await simulateProviderEvent(selected.id, action);
      setResult(response);
      setDialog(null);
      setTransfers((current) =>
        current.filter((transfer) => transfer.id !== selected.id),
      );
      toast.success(
        action === "simulate-success"
          ? "Completion webhook delivered"
          : "Failure webhook delivered",
        {
          description: "The durable activity is now available to SSE clients.",
        },
      );
    } catch (simulationError) {
      const message = safeMessage(simulationError);
      setError(message);
      setDialog(null);
      toast.error("Webhook simulation failed", { description: message });
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <ConsoleShell>
      <section className="console-content simulator-content">
        <Link href="/transfers" className="back-link">
          <ArrowLeft aria-hidden="true" size={16} weight="bold" />
          Back to transfers
        </Link>
        <header className="simulator-header">
          <div className="simulator-title-row">
            <span className="simulator-icon">
              <Flask aria-hidden="true" weight="fill" />
            </span>
            <span className="demo-badge">Demo</span>
          </div>
          <p className="eyebrow">Developer tools</p>
          <h1>Local provider simulator</h1>
          <p>
            Send a signed provider webhook immediately and watch an open
            transfer detail screen update through SSE.
          </p>
        </header>

        {loadState === "loading" ? <BrandedLoader /> : null}
        {loadState === "error" ? (
          <div className="simulator-state" role="alert">
            <WarningCircle aria-hidden="true" />
            <strong>Couldn’t load processing transfers</strong>
            <p>{error}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void load()}
            >
              <ArrowClockwise aria-hidden="true" /> Try again
            </button>
          </div>
        ) : null}
        {loadState === "ready" && !transfers.length && !result ? (
          <div className="simulator-state">
            <Flask aria-hidden="true" />
            <strong>No processing transfers</strong>
            <p>
              Submit a pending transfer first, then return here to simulate its
              provider outcome.
            </p>
            <Link className="primary-button" href="/transfers">
              View transfers
            </Link>
          </div>
        ) : null}

        {loadState === "ready" && transfers.length ? (
          <div className="simulator-panel">
            <label htmlFor="simulator-transfer">Processing transfer</label>
            <select
              id="simulator-transfer"
              value={selectedId}
              disabled={busy}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setResult(null);
              }}
            >
              {transfers.map((transfer) => (
                <option key={transfer.id} value={transfer.id}>
                  {transfer.reference} · {transfer.currency} {transfer.amount}
                </option>
              ))}
            </select>
            {selected ? (
              <div className="simulator-selection">
                <div>
                  <span>Recipient reference</span>
                  <strong>{selected.recipient_ref}</strong>
                </div>
                <div>
                  <span>Provider transfer ID</span>
                  <strong className="numeric">
                    {selected.provider_transfer_id}
                  </strong>
                </div>
                <Link href={`/transfers/${selected.id}`}>
                  Open transfer detail
                </Link>
              </div>
            ) : null}
            <div className="simulator-actions">
              <button
                className="secondary-button simulator-failure"
                type="button"
                disabled={!selected || busy}
                onClick={() => setDialog("simulate-failure")}
              >
                <XCircle aria-hidden="true" /> Simulate failure
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!selected || busy}
                onClick={() => setDialog("simulate-success")}
              >
                <CheckCircle aria-hidden="true" /> Simulate success
              </button>
            </div>
          </div>
        ) : null}

        {loadState === "ready" && error ? (
          <div className="simulator-action-error" role="alert">
            <WarningCircle aria-hidden="true" /> {error}
          </div>
        ) : null}

        {result ? (
          <div className="simulator-success" role="status">
            <CheckCircle aria-hidden="true" weight="fill" />
            <div>
              <strong>Signed webhook delivered</strong>
              <p>
                {result.event === "transfer.completed"
                  ? "Completion"
                  : "Failure"}{" "}
                was accepted by the real webhook pipeline.
              </p>
              <span className="numeric">Event {result.event_id}</span>
            </div>
          </div>
        ) : null}

        <aside className="simulator-note">
          This tool never changes a transfer directly. It sends the same signed
          HTTP webhook a provider would send; PostgreSQL remains authoritative.
        </aside>
        <a
          className="victoria-logs-link"
          href={victoriaLogsUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span>
            <strong>View application logs</strong>
            <small>Open VictoriaLogs in a new tab</small>
          </span>
          <ArrowSquareOut aria-hidden="true" weight="bold" />
        </a>
      </section>

      {dialog && selected ? (
        <ConfirmationDialog
          title={
            dialog === "simulate-success"
              ? "Confirm provider success?"
              : "Confirm provider failure?"
          }
          description={`This immediately sends a signed ${dialog === "simulate-success" ? "completion" : "failure"} webhook for ${selected.reference}. The resulting terminal state cannot be changed.`}
          cancelLabel="Keep processing"
          confirmLabel={
            dialog === "simulate-success"
              ? "Send success webhook"
              : "Send failure webhook"
          }
          busyLabel="Sending webhook…"
          destructive={dialog === "simulate-failure"}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() => void simulate(dialog)}
        />
      ) : null}
    </ConsoleShell>
  );
}
