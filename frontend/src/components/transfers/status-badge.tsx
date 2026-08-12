import type { TransferStatus } from "@/types/transfer";

type StatusBadgeProps = {
  status: TransferStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className="status-badge" data-status={status}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
