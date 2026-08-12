import { BrandedAnimation } from "@/components/transfers/branded-animation";
import { ConsoleShell } from "@/components/transfers/console-shell";
import transferArrows from "@/animations/transfer-arrows.json";

export default function NewTransferLoading() {
  return (
    <ConsoleShell>
      <section
        className="console-content create-route-loading"
        aria-busy="true"
      >
        <BrandedAnimation
          animationData={transferArrows}
          className="loader-animation"
          label="Loading create transfer"
        />
        <strong>Loading create transfer</strong>
        <p>Preparing a secure payout attempt…</p>
      </section>
    </ConsoleShell>
  );
}
