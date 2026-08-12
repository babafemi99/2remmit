import { PaperPlaneTilt, Prohibit } from "@phosphor-icons/react";

import type { TransferStatus } from "@/types/transfer";

const TERMINAL_COPY = {
  completed: "This completed transfer is immutable.",
  failed: "This failed transfer is immutable.",
  cancelled: "This cancelled transfer is immutable.",
} as const;

export function TransferActions({
  status,
  disabled,
  error,
  onSubmit,
  onCancel,
}: {
  status: TransferStatus;
  disabled: boolean;
  error?: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="transfer-actions-panel" aria-label="Transfer actions">
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : null}
      {status === "pending" ? (
        <div className="detail-action-buttons">
          <button
            type="button"
            className="secondary-button danger-secondary"
            disabled={disabled}
            onClick={onCancel}
          >
            <Prohibit aria-hidden="true" />
            Cancel transfer
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={disabled}
            onClick={onSubmit}
          >
            <PaperPlaneTilt aria-hidden="true" />
            Submit transfer
          </button>
        </div>
      ) : null}
      {status === "processing" ? (
        <p className="state-guidance">Waiting for provider confirmation</p>
      ) : null}
      {status in TERMINAL_COPY ? (
        <p className="state-guidance">
          {TERMINAL_COPY[status as keyof typeof TERMINAL_COPY]}
        </p>
      ) : null}
    </section>
  );
}
