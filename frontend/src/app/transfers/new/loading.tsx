import { PageLoader } from "@/components/loading/page-loader";

export default function NewTransferLoading() {
  return (
    <PageLoader
      label="Loading create transfer…"
      description="Preparing a secure payout attempt."
    />
  );
}
