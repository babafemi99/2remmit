import type { Metadata } from "next";
import { TransferDetailScreen } from "@/components/transfer-detail/transfer-detail-screen";

export const metadata: Metadata = {
  title: "Transfer detail | 2Remit",
};

type TransferPlaceholderProps = {
  params: Promise<{ id: string }>;
};

export default async function TransferPlaceholder({
  params,
}: TransferPlaceholderProps) {
  const { id } = await params;
  return <TransferDetailScreen transferId={id} />;
}
