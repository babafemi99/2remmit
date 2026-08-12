import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

import emptyOrbit from "@/animations/empty-orbit.json";
import successCheck from "@/animations/success-check.json";
import transferArrows from "@/animations/transfer-arrows.json";

import { BrandedAnimation } from "./branded-animation";

export function BrandedLoader() {
  return (
    <section className="state-panel" aria-live="polite" aria-busy="true">
      <BrandedAnimation
        animationData={transferArrows}
        className="loader-animation"
        label="Loading transfers"
      />
      <strong>Loading transfers</strong>
      <p>Preparing your payout activity…</p>
    </section>
  );
}

export function TransferEmptyState() {
  return (
    <section className="state-panel results-enter" aria-live="polite">
      <BrandedAnimation
        animationData={emptyOrbit}
        className="empty-animation"
      />
      <strong>No transfers found</strong>
      <p>Try another reference or clear the status filter.</p>
    </section>
  );
}

export function TransferErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="state-panel error-state" role="alert">
      <span className="error-icon">
        <WarningCircle aria-hidden="true" size={24} weight="duotone" />
      </span>
      <strong>Transfers could not be loaded</strong>
      <p>The local assessment data is temporarily unavailable.</p>
      <button type="button" className="secondary-button" onClick={onRetry}>
        <ArrowClockwise aria-hidden="true" size={16} weight="bold" />
        Retry
      </button>
    </section>
  );
}

export function TransferSuccessAnimation() {
  return (
    <BrandedAnimation
      animationData={successCheck}
      className="success-animation"
      label="Transfer status updated successfully"
      loop={false}
    />
  );
}
