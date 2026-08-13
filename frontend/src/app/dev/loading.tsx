import { PageLoader } from "@/components/loading/page-loader";

export default function DeveloperLoading() {
  return (
    <PageLoader
      label="Loading provider simulator…"
      description="Finding transfers awaiting provider confirmation."
    />
  );
}
