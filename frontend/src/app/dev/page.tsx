import type { Metadata } from "next";

import { ProviderSimulatorScreen } from "@/components/provider-simulator/provider-simulator-screen";

export const metadata: Metadata = {
  title: "Provider simulator | 2Remit",
};

export default function ProviderSimulatorPage() {
  return (
    <ProviderSimulatorScreen
      victoriaLogsUrl={
        process.env.VICTORIA_LOGS_PUBLIC_URL ??
        "http://localhost:9428/select/vmui/"
      }
    />
  );
}
