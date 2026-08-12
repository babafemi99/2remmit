import type { TransferDetail } from "@/types/transfer-detail";
import { CopyControl } from "./transfer-detail-header";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TransferMetadata({ transfer }: { transfer: TransferDetail }) {
  const rows = [
    ["Recipient reference", transfer.recipient_ref, false],
    ["Public reference", transfer.reference, true],
    ["Created at", formatTimestamp(transfer.created_at), false],
    ["Last updated", formatTimestamp(transfer.updated_at), false],
    ...(transfer.provider_transfer_id
      ? [["Provider transfer ID", transfer.provider_transfer_id, true] as const]
      : []),
  ] as const;
  return (
    <section className="metadata-section" aria-labelledby="information-heading">
      <h2 id="information-heading">Transfer information</h2>
      <dl className="detail-metadata">
        {rows.map(([label, value, copy]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="numeric">
              <span>{value}</span>
              {copy ? (
                <CopyControl
                  value={value}
                  label={
                    label === "Provider transfer ID"
                      ? "provider transfer ID"
                      : label.toLowerCase()
                  }
                />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
