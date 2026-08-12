"use client";

import { Check, Copy } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/transfers/status-badge";
import type { TransferDetail } from "@/types/transfer-detail";

export function CopyControl({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      type="button"
      className="copy-control"
      aria-label={`Copy ${label}`}
      onClick={copy}
    >
      {copied ? (
        <Check aria-hidden="true" size={15} weight="bold" />
      ) : (
        <Copy aria-hidden="true" size={15} />
      )}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export function TransferDetailHeader({
  transfer,
}: {
  transfer: TransferDetail;
}) {
  return (
    <header className="detail-content-header">
      <Link href="/transfers" className="back-link">
        ← Back to transfers
      </Link>
      <p className="eyebrow">Transfer details</p>
      <div className="detail-reference-row">
        <h1 className="numeric">{transfer.reference}</h1>
        <StatusBadge status={transfer.status} />
      </div>
      <CopyControl value={transfer.reference} label="transfer reference" />
    </header>
  );
}
