import { PageLoader } from "@/components/loading/page-loader";

export default function TransfersLoading() {
  return (
    <PageLoader
      label="Loading transfers…"
      description="Preparing your payout activity."
    />
  );
}
