import { PageLoader } from "@/components/loading/page-loader";

export default function TransferDetailRouteLoading() {
  return (
    <PageLoader
      label="Loading transfer…"
      description="Retrieving the latest transfer state and durable activity."
    />
  );
}
