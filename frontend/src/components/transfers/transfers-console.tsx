"use client";

import { Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConsoleShell } from "@/components/transfers/console-shell";
import { TransferList } from "@/components/transfers/transfer-list";
import {
  BrandedLoader,
  TransferEmptyState,
  TransferErrorState,
} from "@/components/transfers/transfer-states";
import { TransferToolbar } from "@/components/transfers/transfer-toolbar";
import { loadTransfers } from "@/data/transfers";
import type { Transfer } from "@/types/transfer";

type LoadState = "loading" | "ready" | "error";

type TransfersConsoleProps = {
  initialQuery?: string;
  initialStatus?: string;
  initialState?: "normal" | "error";
};

export function TransfersConsole({
  initialQuery = "",
  initialStatus = "all",
  initialState = "normal",
}: TransfersConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [transfers, setTransfers] = useState<readonly Transfer[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;

    loadTransfers(initialState === "error" && retryKey === 0)
      .then((loaded) => {
        if (active) {
          setTransfers(loaded);
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (active) setLoadState("error");
      });

    return () => {
      active = false;
    };
  }, [initialState, retryKey]);

  const updateUrl = useCallback(
    (nextQuery: string, nextStatus: string) => {
      const params = new URLSearchParams();
      if (nextQuery) params.set("query", nextQuery);
      if (nextStatus !== "all") params.set("status", nextStatus);
      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    updateUrl(nextQuery, status);
  };

  const changeStatus = (nextStatus: string) => {
    setStatus(nextStatus);
    updateUrl(query, nextStatus);
  };

  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    updateUrl("", "all");
  };

  const retry = () => {
    setLoadState("loading");
    setRetryKey((value) => value + 1);
  };

  const visibleTransfers = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    return transfers.filter((transfer) => {
      const matchesReference = transfer.reference.includes(normalizedQuery);
      const matchesStatus = status === "all" || transfer.status === status;
      return matchesReference && matchesStatus;
    });
  }, [query, status, transfers]);

  return (
    <ConsoleShell>
      <section className="console-content">
        <div className="content-header">
          <div>
            <p className="eyebrow">Payout console</p>
            <h1>Your transfers</h1>
            <p className="supporting-copy">
              Create and track cross-border payouts.
            </p>
          </div>
          <Link href="/transfers/new" className="primary-button">
            <Plus aria-hidden="true" size={18} weight="bold" />
            New transfer
          </Link>
        </div>

        <TransferToolbar
          query={query}
          status={status}
          onQueryChange={changeQuery}
          onStatusChange={changeStatus}
          onClear={clearFilters}
        />

        <div className="results-shell">
          {loadState === "loading" ? <BrandedLoader /> : null}
          {loadState === "error" ? (
            <TransferErrorState onRetry={retry} />
          ) : null}
          {loadState === "ready" && visibleTransfers.length ? (
            <TransferList transfers={visibleTransfers} />
          ) : null}
          {loadState === "ready" && !visibleTransfers.length ? (
            <TransferEmptyState />
          ) : null}
        </div>
      </section>
    </ConsoleShell>
  );
}
