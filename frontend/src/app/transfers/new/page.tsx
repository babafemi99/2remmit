import type { Metadata } from "next";

import { CreateTransferScreen } from "@/components/create-transfer/create-transfer-screen";

export const metadata: Metadata = {
  title: "Create transfer | 2Remit",
};

export default function NewTransferPage() {
  return <CreateTransferScreen />;
}
