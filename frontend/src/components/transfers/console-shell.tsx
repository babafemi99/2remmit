import type { ReactNode } from "react";

import { ConsoleHeader } from "./console-header";
import { TrustStrip } from "./trust-strip";

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-stage">
      <div className="atmosphere atmosphere-blue" aria-hidden="true" />
      <div className="atmosphere atmosphere-purple" aria-hidden="true" />

      <article className="transfers-console">
        <ConsoleHeader />
        <div className="brand-line" aria-hidden="true" />
        {children}
        <TrustStrip />
      </article>
    </main>
  );
}
