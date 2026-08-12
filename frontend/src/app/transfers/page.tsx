import { TransfersConsole } from "@/components/transfers/transfers-console";

type TransfersPageProps = {
  searchParams: Promise<{
    query?: string;
    status?: string;
    state?: string;
  }>;
};

export default async function TransfersPage({
  searchParams,
}: TransfersPageProps) {
  const params = await searchParams;
  return (
    <TransfersConsole
      initialQuery={params.query ?? ""}
      initialStatus={params.status ?? "all"}
      initialState={params.state === "error" ? "error" : "normal"}
    />
  );
}
