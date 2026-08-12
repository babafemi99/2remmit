import { Check, Circle, Prohibit, SpinnerGap, X } from "@phosphor-icons/react";

import type { TransferStatus } from "@/types/transfer";

export function TransferLifecycle({ status }: { status: TransferStatus }) {
  if (status === "cancelled") {
    return (
      <section
        className="lifecycle lifecycle-cancelled"
        aria-label="Transfer lifecycle"
      >
        <div data-state="complete">
          <Check aria-hidden="true" />
          <span>Created</span>
        </div>
        <i data-branch="true" aria-hidden="true" />
        <div data-state="cancelled">
          <Prohibit aria-hidden="true" />
          <span>Cancelled</span>
        </div>
      </section>
    );
  }
  const submitted = ["processing", "completed", "failed"].includes(status);
  const terminal = ["completed", "failed", "cancelled"].includes(status);
  const finalLabel =
    status === "failed"
      ? "Failed"
      : status === "completed"
        ? "Completed"
        : "Final outcome";
  const FinalIcon =
    status === "completed" ? Check : status === "failed" ? X : Circle;
  return (
    <section className="lifecycle" aria-label="Transfer lifecycle">
      <div data-state={status === "pending" ? "active" : "complete"}>
        <Check aria-hidden="true" />
        <span>Created</span>
      </div>
      <i data-complete={submitted} aria-hidden="true" />
      <div
        data-state={
          status === "processing"
            ? "active"
            : submitted
              ? "complete"
              : "inactive"
        }
      >
        {status === "processing" ? (
          <SpinnerGap className="lifecycle-processing" aria-hidden="true" />
        ) : (
          <Check aria-hidden="true" />
        )}
        <span>Submitted</span>
      </div>
      <i data-complete={terminal} aria-hidden="true" />
      <div data-state={terminal ? status : "inactive"}>
        <FinalIcon aria-hidden="true" />
        <span>{finalLabel}</span>
      </div>
    </section>
  );
}
