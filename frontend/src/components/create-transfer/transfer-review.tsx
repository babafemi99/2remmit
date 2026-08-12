import { ArrowLeft, LockKey } from "@phosphor-icons/react";

import type { CreateTransferRequest } from "@/types/create-transfer";
import { CURRENCY_SYMBOLS, formatMoneyAmount } from "@/lib/money";

import { TransferSummary } from "./transfer-summary";

type TransferReviewProps = {
  request: CreateTransferRequest;
  submitting: boolean;
  error?: { message: string; conflict?: boolean };
  onEdit: () => void;
  onSubmit: () => void;
  onStartNewAttempt: () => void;
};

export function TransferReview({
  request,
  submitting,
  error,
  onEdit,
  onSubmit,
  onStartNewAttempt,
}: TransferReviewProps) {
  return (
    <section
      className="review-panel step-enter"
      aria-labelledby="review-heading"
    >
      <div className="review-amount numeric">
        <span>{request.currency}</span>
        <strong id="review-heading">
          <small aria-hidden="true">{CURRENCY_SYMBOLS[request.currency]}</small>
          {formatMoneyAmount(request.amount)}
        </strong>
      </div>

      <TransferSummary request={request} />

      <div className="review-note">
        <LockKey aria-hidden="true" size={21} weight="duotone" />
        <div>
          <strong>Protected against duplicate creation</strong>
          <p>
            Safe retries reuse this attempt. The transfer will be created but
            not submitted to the provider.
          </p>
        </div>
      </div>

      {error?.conflict ? (
        <div className="conflict-recovery">
          <p>A fresh idempotency key is required before retrying.</p>
          <button type="button" onClick={onStartNewAttempt}>
            Start a new attempt
          </button>
        </div>
      ) : null}

      <div className="form-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={submitting}
          onClick={onEdit}
        >
          <ArrowLeft aria-hidden="true" size={17} weight="bold" />
          Edit details
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={submitting || error?.conflict}
          aria-busy={submitting}
          onClick={onSubmit}
        >
          {submitting ? <TransferButtonLoader /> : null}
          {submitting ? "Creating transfer…" : "Create transfer"}
        </button>
      </div>
    </section>
  );
}

function TransferButtonLoader() {
  return (
    <span className="transfer-button-loader" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}
