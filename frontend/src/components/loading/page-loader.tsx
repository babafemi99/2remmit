import transferArrows from "@/animations/transfer-arrows.json";
import { BrandedAnimation } from "@/components/transfers/branded-animation";
import { ConsoleShell } from "@/components/transfers/console-shell";

type PageLoaderProps = {
  label: string;
  description: string;
};

export function PageLoader({ label, description }: PageLoaderProps) {
  return (
    <ConsoleShell>
      <section
        className="console-content page-route-loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <BrandedAnimation
          animationData={transferArrows}
          className="loader-animation"
        />
        <strong>{label}</strong>
        <p>{description}</p>
      </section>
    </ConsoleShell>
  );
}
