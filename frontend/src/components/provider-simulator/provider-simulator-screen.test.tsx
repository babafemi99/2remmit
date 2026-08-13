import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToaster } from "@/components/app-toaster";
import { ProviderSimulatorScreen } from "./provider-simulator-screen";

const PROCESSING = {
  id: "019ff73e-b943-7675-8512-897c6180cc06",
  reference: "TRF-ZZQ7K8ZOLQ",
  amount: "1250.00",
  currency: "GBP",
  recipient_ref: "TUITION-LEE-24",
  status: "processing",
  provider_transfer_id: "PRV-123",
  created_at: "2026-08-12T10:00:00Z",
  updated_at: "2026-08-12T10:01:00Z",
};
const PENDING = { ...PROCESSING, id: "other", status: "pending" };
const SECOND_PROCESSING = {
  ...PROCESSING,
  id: "019ff73e-b943-7675-8512-897c6180cc07",
  reference: "TRF-SECOND0001",
  amount: "250000.00",
  currency: "NGN",
  recipient_ref: "ACME-SUPPLIER-01",
  provider_transfer_id: "PRV-456",
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderScreen() {
  return render(
    <>
      <ProviderSimulatorScreen />
      <AppToaster />
    </>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => json([PROCESSING, PENDING])),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProviderSimulatorScreen", () => {
  it("provides clear navigation back to transfers", async () => {
    render(<ProviderSimulatorScreen />);

    expect(
      screen.getByRole("link", { name: "Back to transfers" }),
    ).toHaveAttribute("href", "/transfers");
  });

  it("loads and displays only processing transfers", async () => {
    renderScreen();
    expect(screen.getByText("Loading transfers")).toBeVisible();
    const processingOption = await screen.findByRole("radio", {
      name: /TRF-ZZQ7K8ZOLQ/,
    });
    expect(processingOption).toBeChecked();
    expect(processingOption.closest("label")).toHaveTextContent("£1,250.00");
    expect(screen.queryByText(/other/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open transfer detail" }),
    ).toHaveAttribute("href", `/transfers/${PROCESSING.id}`);
  });

  it("selects a visible transfer card and updates its actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          json([PROCESSING, SECOND_PROCESSING, PENDING]),
        ),
    );
    renderScreen();
    const user = userEvent.setup();
    const second = await screen.findByRole("radio", {
      name: /TRF-SECOND0001/,
    });
    expect(second.closest("label")).toHaveTextContent("₦250,000.00");
    await user.click(second);
    expect(second).toBeChecked();
    expect(
      screen.getByRole("link", { name: "Open transfer detail" }),
    ).toHaveAttribute("href", `/transfers/${SECOND_PROCESSING.id}`);
    expect(screen.getByText("PRV-456")).toBeVisible();
  });

  it("renders an empty state when no transfer is processing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => json([PENDING])),
    );
    renderScreen();
    expect(await screen.findByText("No processing transfers")).toBeVisible();
  });

  it("retries a list error", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementation(() => json([PROCESSING]));
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("radio", { name: /TRF-ZZQ7K8ZOLQ/ }),
    ).toBeVisible();
  });

  it.each([
    [
      "Simulate success",
      "Send success webhook",
      "simulate-success",
      "transfer.completed",
    ],
    [
      "Simulate failure",
      "Send failure webhook",
      "simulate-failure",
      "transfer.failed",
    ],
  ])(
    "confirms %s and invokes the real proxy once",
    async (openLabel, confirmLabel, path, event) => {
      let resolveRequest!: (response: Response) => void;
      vi.mocked(fetch).mockImplementation((input) => {
        if (String(input).includes("/api/dev/"))
          return new Promise((resolve) => {
            resolveRequest = resolve;
          });
        return json([PROCESSING]);
      });
      renderScreen();
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: openLabel }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("immediately sends a signed");
      const confirm = within(dialog).getByRole("button", {
        name: confirmLabel,
      });
      fireEvent.click(confirm);
      fireEvent.click(confirm);
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(
            ([url]) =>
              String(url).includes(`/api/dev/`) && String(url).endsWith(path),
          ).length,
      ).toBe(1);
      resolveRequest(
        await json({
          detail: "Provider event delivered",
          event_id: "evt_sim_1",
          event,
          webhook_status: 200,
        }),
      );
      expect(await screen.findByText("Signed webhook delivered")).toBeVisible();
    },
  );

  it("cancels confirmation without sending a webhook", async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Simulate success" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Keep processing",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
