import {
  cleanup,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getNavigationMocks } from "../../../vitest.setup";
import { AppToaster } from "@/components/app-toaster";
import { CreateTransferScreen } from "./create-transfer-screen";

const navigationMocks = getNavigationMocks();

function render(ui: React.ReactNode) {
  return testingRender(
    <>
      {ui}
      <AppToaster />
    </>,
  );
}

const SUCCESS_RESPONSE = {
  id: "0198a06d-cc67-7000-8000-000000000001",
  reference: "TRF-NEW123",
  amount: "1250.00",
  currency: "GBP",
  recipient_ref: "TUITION-LEE-24",
  status: "pending",
  provider_transfer_id: null,
  created_at: "2026-08-12T10:00:00Z",
  updated_at: "2026-08-12T10:00:00Z",
};

function jsonResponse(body: unknown, status = 201) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function fillValidDetails() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Amount"), "1250.00");
  await user.click(screen.getByRole("radio", { name: /GBP.*British pound/i }));
  await user.type(
    screen.getByLabelText("Recipient reference"),
    "TUITION-LEE-24",
  );
  return user;
}

async function reachReview() {
  const user = await fillValidDetails();
  await user.click(screen.getByRole("button", { name: "Review transfer" }));
  await screen.findByRole("button", { name: "Create transfer" });
  return user;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CreateTransferScreen", () => {
  it("defaults to NGN and requires the remaining fields before review", () => {
    render(<CreateTransferScreen />);
    expect(
      screen.getByRole("radio", { name: /NGN.*Nigerian naira/i }),
    ).toBeChecked();
    expect(
      screen.getByLabelText("Amount").previousElementSibling,
    ).toHaveTextContent("₦");
    expect(
      screen.getByRole("button", { name: "Review transfer" }),
    ).toBeDisabled();
    fireEvent.submit(
      screen.getByRole("button", { name: "Review transfer" }).closest("form")!,
    );
    expect(screen.getByText("Enter an amount.")).toBeInTheDocument();
    expect(
      screen.getByText("Enter a recipient reference."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveFocus();
  });

  it("requires an amount greater than zero", async () => {
    const user = userEvent.setup();
    render(<CreateTransferScreen />);
    await user.type(screen.getByLabelText("Amount"), "0.00");
    await user.click(
      screen.getByRole("radio", { name: /NGN.*Nigerian naira/i }),
    );
    await user.type(screen.getByLabelText("Recipient reference"), "ACME-1");
    fireEvent.submit(
      screen.getByRole("button", { name: "Review transfer" }).closest("form")!,
    );
    expect(
      screen.getByText("Amount must be greater than zero."),
    ).toBeInTheDocument();
  });

  it("formats the amount with bank-style thousands separators", async () => {
    const user = userEvent.setup();
    render(<CreateTransferScreen />);
    const amount = screen.getByLabelText("Amount");
    await user.type(amount, "1250000.50");
    expect(amount).toHaveValue("1,250,000.50");
  });

  it("adds currency symbols and completes cents when leaving the amount", async () => {
    const user = userEvent.setup();
    render(<CreateTransferScreen />);
    const amount = screen.getByLabelText("Amount");
    await user.type(amount, "250000");
    await user.tab();
    expect(amount).toHaveValue("250,000.00");
    expect(amount.previousElementSibling).toHaveTextContent("₦");
  });

  it("supports keyboard-operable currency selection", async () => {
    const user = userEvent.setup();
    render(<CreateTransferScreen />);
    const usd = screen.getByRole("radio", { name: /USD.*US dollar/i });
    usd.focus();
    await user.keyboard(" ");
    expect(usd).toBeChecked();
  });

  it("moves from details to an accurate review", async () => {
    render(<CreateTransferScreen />);
    await reachReview();
    expect(screen.getByText("1,250.00")).toBeInTheDocument();
    expect(screen.getByText("TUITION-LEE-24")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(
      screen.getByText(/not submitted to the provider/i),
    ).toBeInTheDocument();
  });

  it("preserves entered data when editing details", async () => {
    render(<CreateTransferScreen />);
    const user = await reachReview();
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByLabelText("Amount")).toHaveValue("1,250.00");
    expect(
      screen.getByRole("radio", { name: /GBP.*British pound/i }),
    ).toBeChecked();
    expect(screen.getByLabelText("Recipient reference")).toHaveValue(
      "TUITION-LEE-24",
    );
  });

  it("posts the exact string body with an idempotency key", async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse(SUCCESS_RESPONSE));
    render(<CreateTransferScreen />);
    const user = await reachReview();
    await user.click(screen.getByRole("button", { name: "Create transfer" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      amount: "1250.00",
      currency: "GBP",
      recipient_ref: "TUITION-LEE-24",
    });
    expect(new Headers(init?.headers).get("Idempotency-Key")).toMatch(
      /[0-9a-f-]{36}/i,
    );
  });

  it("prevents a double click from creating two requests", async () => {
    let resolveRequest!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () => new Promise((resolve) => (resolveRequest = resolve)),
    );
    render(<CreateTransferScreen />);
    await reachReview();
    const button = screen.getByRole("button", { name: "Create transfer" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Creating transfer…")).toBeInTheDocument();
    expect(
      document.querySelector(".transfer-button-loader"),
    ).toBeInTheDocument();
    resolveRequest(await jsonResponse(SUCCESS_RESPONSE));
  });

  it("reuses the same key after an uncertain network failure", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("network failed"))
      .mockImplementationOnce(() => jsonResponse(SUCCESS_RESPONSE));
    render(<CreateTransferScreen />);
    const user = await reachReview();
    await user.click(screen.getByRole("button", { name: "Create transfer" }));
    expect(await screen.findByText("Connection interrupted")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create transfer" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const firstKey = new Headers(
      vi.mocked(fetch).mock.calls[0][1]?.headers,
    ).get("Idempotency-Key");
    const secondKey = new Headers(
      vi.mocked(fetch).mock.calls[1][1]?.headers,
    ).get("Idempotency-Key");
    expect(secondKey).toBe(firstKey);
  });

  it("rotates the key after an attempted body is edited", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("network failed"))
      .mockImplementationOnce(() =>
        jsonResponse({ ...SUCCESS_RESPONSE, amount: "1300.00" }),
      );
    render(<CreateTransferScreen />);
    const user = await reachReview();
    await user.click(screen.getByRole("button", { name: "Create transfer" }));
    expect(await screen.findByText("Connection interrupted")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    const amount = screen.getByLabelText("Amount");
    await user.clear(amount);
    await user.type(amount, "1300.00");
    await user.click(screen.getByRole("button", { name: "Review transfer" }));
    await user.click(screen.getByRole("button", { name: "Create transfer" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const firstKey = new Headers(
      vi.mocked(fetch).mock.calls[0][1]?.headers,
    ).get("Idempotency-Key");
    const secondKey = new Headers(
      vi.mocked(fetch).mock.calls[1][1]?.headers,
    ).get("Idempotency-Key");
    expect(secondKey).not.toBe(firstKey);
  });

  it("explains a same-key different-body conflict and starts a new attempt", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({ detail: "Idempotency conflict" }, 409),
    );
    render(<CreateTransferScreen />);
    const user = await reachReview();
    await user.click(screen.getByRole("button", { name: "Create transfer" }));
    expect(
      await screen.findByText("A new attempt is required"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create transfer" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Start a new attempt" }),
    );
    expect(
      screen.getByRole("button", { name: "Create transfer" }),
    ).toBeEnabled();
  });

  it("shows the full journey and allows an API toast to be dismissed", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("network failed"));
    render(<CreateTransferScreen />);
    expect(screen.getByLabelText("Step 1 of 3")).toHaveTextContent(
      "DetailsReviewCreate",
    );
    const user = await reachReview();
    expect(screen.getByLabelText("Step 2 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create transfer" }));
    const toastMessage = await screen.findByText(/response may be uncertain/i);
    expect(toastMessage).toBeVisible();
    await user.click(screen.getByRole("button", { name: /close toast/i }));
    await waitFor(() => expect(toastMessage).not.toBeInTheDocument());
  });

  it("places DRF field errors beside their fields", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({ recipient_ref: ["That reference is not accepted."] }, 400),
    );
    render(<CreateTransferScreen />);
    const user = await reachReview();
    await user.click(screen.getByRole("button", { name: "Create transfer" }));
    expect(
      await screen.findByText("That reference is not accepted."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Recipient reference")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("navigates to the UUID detail route after successful creation", async () => {
    vi.mocked(fetch).mockImplementation(() => jsonResponse(SUCCESS_RESPONSE));
    render(<CreateTransferScreen />);
    const user = await reachReview();
    await user.click(screen.getByRole("button", { name: "Create transfer" }));
    await waitFor(() =>
      expect(navigationMocks.push).toHaveBeenCalledWith(
        `/transfers/${SUCCESS_RESPONSE.id}?reference=TRF-NEW123`,
      ),
    );
  });

  it("remains fully usable with reduced motion enabled", async () => {
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
    render(<CreateTransferScreen />);
    await reachReview();
    expect(
      screen.getByRole("button", { name: "Create transfer" }),
    ).toBeEnabled();
    expect(screen.getByText("TUITION-LEE-24")).toBeVisible();
  });

  it("links back to the transfers console", () => {
    render(<CreateTransferScreen />);
    expect(
      screen.getByRole("link", { name: "Back to transfers" }),
    ).toHaveAttribute("href", "/transfers");
  });
});
