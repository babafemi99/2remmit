import { TransferSuccessAnimation } from "@/components/transfers/transfer-states";

export function CreateTransferSuccess({ reference }: { reference: string }) {
  return (
    <section className="create-success" role="status" aria-live="polite">
      <TransferSuccessAnimation />
      <strong>Transfer created</strong>
      <p className="numeric">{reference}</p>
    </section>
  );
}
