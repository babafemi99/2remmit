import { CaretRight } from "@phosphor-icons/react";
import Link from "next/link";

import { StatusBadge } from "@/components/transfers/status-badge";
import { CURRENCY_SYMBOLS } from "@/lib/money";
import type { Transfer } from "@/types/transfer";

const amountFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type TransferRowProps = {
  transfer: Transfer;
};

export function TransferRow({ transfer }: TransferRowProps) {
  return (
    <Link
      href={`/transfers/${transfer.id}`}
      className="transfer-row"
      aria-label={`View transfer ${transfer.reference}`}
    >
      <div className="transfer-identity">
        <strong className="numeric transfer-reference">
          {transfer.reference}
        </strong>
        <span className="numeric recipient-reference">
          {transfer.recipientReference}
        </span>
        <div className="transfer-meta">
          <StatusBadge status={transfer.status} />
          <span className="meta-dot" aria-hidden="true" />
          <time className="numeric">{transfer.updatedLabel}</time>
        </div>
      </div>
      <div className="transfer-value">
        <strong className="numeric amount">
          <span aria-hidden="true">{CURRENCY_SYMBOLS[transfer.currency]}</span>
          <span className="sr-only">{transfer.currency} </span>
          {amountFormatter.format(transfer.amount)}
        </strong>
        <CaretRight
          className="row-chevron"
          aria-hidden="true"
          size={20}
          weight="bold"
        />
      </div>
    </Link>
  );
}
