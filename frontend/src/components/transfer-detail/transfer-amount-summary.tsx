import { CURRENCY_SYMBOLS, formatMoneyAmount } from "@/lib/money";
import type { TransferDetail } from "@/types/transfer-detail";

const EXPLANATIONS = {
  pending: "Created and ready for submission.",
  processing: "Submitted to the provider and awaiting confirmation.",
  completed: "The provider confirmed this transfer.",
  failed: "The provider reported that this transfer failed.",
  cancelled: "This transfer was cancelled before submission.",
} as const;

export function TransferAmountSummary({
  transfer,
}: {
  transfer: TransferDetail;
}) {
  return (
    <section
      className="detail-amount-summary"
      aria-label="Transfer amount and status"
    >
      <div className="detail-amount numeric">
        <span>{transfer.currency}</span>
        <strong>
          <small aria-hidden="true">
            {CURRENCY_SYMBOLS[transfer.currency]}
          </small>
          {formatMoneyAmount(transfer.amount)}
        </strong>
      </div>
      <p>{EXPLANATIONS[transfer.status]}</p>
    </section>
  );
}
