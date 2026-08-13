import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusBadge } from "./status-badge";
import { TransfersConsole } from "./transfers-console";
import { TRANSFER_FIXTURES } from "@/data/transfers";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          TRANSFER_FIXTURES.map((transfer) => ({
            id: transfer.id,
            reference: transfer.reference,
            recipient_ref: transfer.recipientReference,
            amount: transfer.amount.toFixed(2),
            currency: transfer.currency,
            status: transfer.status,
            provider_transfer_id: null,
            created_at: "2026-08-12T10:00:00Z",
            updated_at: "2026-08-12T10:00:00Z",
          })),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function renderLoadedConsole(props = {}) {
  render(<TransfersConsole {...props} />);
  await screen.findByText("TRF-8N4K2P");
}

describe("TransfersConsole", () => {
  it("searches by public transfer reference", async () => {
    const user = userEvent.setup();
    await renderLoadedConsole();

    await user.type(
      screen.getByRole("searchbox", { name: "Search by transfer reference" }),
      "6C8L1R",
    );

    expect(screen.getByText("TRF-6C8L1R")).toBeInTheDocument();
    expect(screen.queryByText("TRF-8N4K2P")).not.toBeInTheDocument();
  });

  it("filters transfers by status", async () => {
    const user = userEvent.setup();
    await renderLoadedConsole();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by transfer status" }),
      "failed",
    );

    expect(screen.getByText("TRF-5B2H7T")).toBeInTheDocument();
    expect(screen.queryByText("TRF-7M3J9Q")).not.toBeInTheDocument();
  });

  it("shows the filtered empty state", async () => {
    const user = userEvent.setup();
    await renderLoadedConsole();

    await user.type(
      screen.getByRole("searchbox", { name: "Search by transfer reference" }),
      "TRF-NOT-FOUND",
    );

    expect(screen.getByText("No transfers found")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("renders a text label for every supported status", () => {
    const statuses = [
      "pending",
      "processing",
      "completed",
      "failed",
      "cancelled",
    ] as const;
    const { rerender } = render(<StatusBadge status={statuses[0]} />);

    for (const status of statuses) {
      rerender(<StatusBadge status={status} />);
      expect(
        screen.getByText(status[0].toUpperCase() + status.slice(1)),
      ).toBeInTheDocument();
    }
  });

  it("exposes transfer rows as keyboard-accessible links", async () => {
    const user = userEvent.setup();
    await renderLoadedConsole();
    const row = screen.getByRole("link", { name: "View transfer TRF-8N4K2P" });

    expect(row).toHaveAttribute("href", "/transfers/8n4k2p");
    await user.tab();
    while (document.activeElement !== row) await user.tab();
    expect(row).toHaveFocus();
  });

  it("points primary navigation links to their placeholder routes", async () => {
    await renderLoadedConsole();

    expect(screen.getByRole("link", { name: /new transfer/i })).toHaveAttribute(
      "href",
      "/transfers/new",
    );
    const developerLink = screen.getByRole("link", { name: /developer/i });
    expect(developerLink).toHaveAttribute("href", "/dev");
    expect(developerLink).toHaveAttribute("target", "_blank");
    expect(developerLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps content visible when reduced motion is requested", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<TransfersConsole />);
    expect(screen.getByText("Loading transfers")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("TRF-8N4K2P")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "Your transfers" }),
    ).toBeVisible();
  });
});
