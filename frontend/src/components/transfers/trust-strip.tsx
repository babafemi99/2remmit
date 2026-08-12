"use client";

import { LockKey, ShieldCheck, Stack } from "@phosphor-icons/react";

const TRUST_ITEMS = [
  { label: "Signed webhooks", Icon: ShieldCheck },
  { label: "Idempotent", Icon: Stack },
  { label: "State-safe", Icon: LockKey },
] as const;

export function TrustStrip() {
  return (
    <footer className="trust-footer">
      <div className="trust-strip" aria-label="Platform safeguards">
        {TRUST_ITEMS.map(({ label, Icon }) => (
          <span key={label} className="trust-item">
            <Icon aria-hidden="true" size={18} weight="duotone" />
            {label}
          </span>
        ))}
      </div>
      <p>Local assessment environment</p>
    </footer>
  );
}
