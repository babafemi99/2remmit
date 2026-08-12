import type { Transfer } from "@/types/transfer";

import { TransferRow } from "./transfer-row";

type TransferListProps = {
  transfers: readonly Transfer[];
};

export function TransferList({ transfers }: TransferListProps) {
  return (
    <section
      className="transfer-list results-enter"
      aria-label="Transfers"
      aria-live="polite"
    >
      {transfers.map((transfer) => (
        <TransferRow key={transfer.id} transfer={transfer} />
      ))}
    </section>
  );
}
