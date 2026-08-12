import {
  ArrowClockwise,
  ArrowLeft,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";

import transferArrows from "@/animations/transfer-arrows.json";
import { BrandedAnimation } from "@/components/transfers/branded-animation";
import { ConsoleShell } from "@/components/transfers/console-shell";

export function TransferDetailLoading() {
  return (
    <ConsoleShell>
      <section className="console-content detail-state" aria-busy="true">
        <BrandedAnimation
          animationData={transferArrows}
          className="loader-animation"
          label="Loading transfer"
        />
        <h1>Loading transfer…</h1>
        <p>Retrieving the latest transfer state and durable activity.</p>
      </section>
    </ConsoleShell>
  );
}

export function TransferNotFound() {
  return (
    <ConsoleShell>
      <section className="console-content detail-state">
        <WarningCircle aria-hidden="true" className="detail-state-icon" />
        <h1>Transfer not found</h1>
        <p>The transfer reference may be invalid or unavailable.</p>
        <Link href="/transfers" className="primary-button">
          <ArrowLeft aria-hidden="true" />
          Back to transfers
        </Link>
      </section>
    </ConsoleShell>
  );
}

export function TransferDetailError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <ConsoleShell>
      <section className="console-content detail-state" role="alert">
        <WarningCircle aria-hidden="true" className="detail-state-icon" />
        <h1>We couldn’t load this transfer</h1>
        <p>{message}</p>
        <div>
          <button type="button" className="primary-button" onClick={onRetry}>
            <ArrowClockwise aria-hidden="true" />
            Try again
          </button>
          <Link href="/transfers" className="secondary-button">
            Back to transfers
          </Link>
        </div>
      </section>
    </ConsoleShell>
  );
}
