import type { CreateTransferRequest } from "@/types/create-transfer";

export function TransferSummary({
  request,
}: {
  request: CreateTransferRequest;
}) {
  return (
    <dl className="transfer-summary">
      <div>
        <dt>Recipient reference</dt>
        <dd className="numeric">{request.recipient_ref}</dd>
      </div>
      <div>
        <dt>Initial status</dt>
        <dd>
          <span className="status-badge" data-status="pending">
            Pending
          </span>
        </dd>
      </div>
    </dl>
  );
}
