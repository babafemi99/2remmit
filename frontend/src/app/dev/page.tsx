import type { Metadata } from "next";

import { ProviderSimulatorScreen } from "@/components/provider-simulator/provider-simulator-screen";

export const metadata: Metadata = {
  title: "Provider simulator | 2Remit",
};

export default function ProviderSimulatorPage() {
  return <ProviderSimulatorScreen />;
}
