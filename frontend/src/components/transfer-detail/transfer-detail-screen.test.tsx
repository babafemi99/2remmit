import {
  act,
  cleanup,
  fireEvent,
  render as testingRender,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppToaster } from "@/components/app-toaster";
import type { TransferActivityEvent } from "@/types/transfer-detail";
import { TransferDetailScreen } from "./transfer-detail-screen";

const ID = "0198a06d-cc67-7000-8000-000000000001";
const TRANSFER = {
  id: ID,
  reference: "TRF-8N4K2P",
  amount: "250000.00",
  currency: "NGN",
  recipient_ref: "ACME-SUPPLIER-01",
  status: "pending",
  provider_transfer_id: null,
  created_at: "2026-08-12T10:00:00Z",
  updated_at: "2026-08-12T10:00:00Z",
};
const CREATED = {
  id: 11,
  type: "created",
  source: "api",
  message: "Transfer created",
  previous_status: null,
  new_status: "pending",
  event_id: null,
  created_at: "2026-08-12T10:00:00Z",
};

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (event: MessageEvent) => void>();
  closed = false;
  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(type, listener as (event: MessageEvent) => void);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  error() {
    this.onerror?.();
  }
  emit(activity: TransferActivityEvent) {
    this.listeners.get("transfer.activity")?.(
      new MessageEvent("transfer.activity", { data: JSON.stringify(activity) }),
    );
  }
}

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function routeFetch(
  overrides: {
    detail?: unknown;
    activities?: unknown;
    detailStatus?: number;
  } = {},
) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/activities/"))
      return response(overrides.activities ?? [CREATED]);
    return response(
      overrides.detail ?? TRANSFER,
      overrides.detailStatus ?? 200,
    );
  });
}

function renderDetail() {
  return testingRender(
    <>
      <TransferDetailScreen transferId={ID} />
      <AppToaster />
    </>,
  );
}

async function ready() {
  await screen.findByRole("heading", { name: "TRF-8N4K2P" });
  await screen.findByText("Transfer created");
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal("fetch", routeFetch());
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TransferDetailScreen", () => {
  it("shows a stable branded loading state", () => {
    renderDetail();
    expect(
      screen.getByRole("heading", { name: "Loading transfer…" }),
    ).toBeVisible();
  });

  it("renders the authoritative transfer and canonical activity order", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        activities: [{ ...CREATED, id: 12, message: "Second" }, CREATED],
      }),
    );
    renderDetail();
    await ready();
    expect(screen.getByText("NGN")).toBeVisible();
    expect(screen.getByText("250,000.00")).toBeVisible();
    expect(screen.getByText("Created and ready for submission.")).toBeVisible();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Transfer created");
    expect(items[1]).toHaveTextContent("Second");
  });

  it("shows not found", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({ detail: { detail: "Not found" }, detailStatus: 404 }),
    );
    renderDetail();
    expect(
      await screen.findByRole("heading", { name: "Transfer not found" }),
    ).toBeVisible();
  });

  it("retries an initial API error", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementation(routeFetch());
    renderDetail();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await ready();
  });

  it("shows actions only for pending transfers", async () => {
    renderDetail();
    await ready();
    expect(
      screen.getByRole("button", { name: "Submit transfer" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cancel transfer" }),
    ).toBeVisible();
  });

  it.each(["processing", "completed", "failed", "cancelled"])(
    "hides mutation actions for %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        routeFetch({
          detail: {
            ...TRANSFER,
            status,
            provider_transfer_id: status === "processing" ? "PRV-123" : null,
          },
        }),
      );
      renderDetail();
      await ready();
      expect(
        screen.queryByRole("button", { name: "Submit transfer" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Cancel transfer" }),
      ).not.toBeInTheDocument();
    },
  );

  it("confirms and successfully submits once", async () => {
    let resolveMutation!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/submit/"))
          return new Promise<Response>((resolve) => {
            resolveMutation = resolve;
          });
        if (url.endsWith("/activities/")) return response([CREATED]);
        return response(TRANSFER);
      }),
    );
    renderDetail();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Submit transfer" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "cannot be cancelled afterwards",
    );
    const confirm = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Submit transfer",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).endsWith("/submit/")).length,
    ).toBe(1);
    resolveMutation(
      await response({
        ...TRANSFER,
        status: "processing",
        provider_transfer_id: "PRV-123",
      }),
    );
    expect(
      await screen.findByText("Waiting for provider confirmation"),
    ).toBeVisible();
  });

  it("confirms cancellation and renders an immutable state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/cancel/"))
          return response({ ...TRANSFER, status: "cancelled" });
        if (url.endsWith("/activities/")) return response([CREATED]);
        return response(TRANSFER);
      }),
    );
    renderDetail();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancel transfer" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Cancellation is terminal",
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel transfer",
      }),
    );
    expect(
      await screen.findByText("This cancelled transfer is immutable."),
    ).toBeVisible();
  });

  it("shows provider ID only when present", async () => {
    renderDetail();
    await ready();
    expect(screen.queryByText("Provider transfer ID")).not.toBeInTheDocument();
  });

  it("shows a copyable provider ID when the API exposes one", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        detail: {
          ...TRANSFER,
          status: "processing",
          provider_transfer_id: "PRV-123456",
        },
      }),
    );
    renderDetail();
    await ready();
    expect(screen.getByText("Provider transfer ID")).toBeVisible();
    expect(screen.getByText("PRV-123456")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy provider transfer ID" }),
    ).toBeVisible();
  });

  it("refetches authoritative state after an invalid transition", async () => {
    let detailCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/submit/"))
          return response(
            { detail: "Transfer cannot be submitted from processing." },
            409,
          );
        if (url.endsWith("/activities/")) return response([CREATED]);
        detailCalls += 1;
        return response(
          detailCalls > 1
            ? {
                ...TRANSFER,
                status: "processing",
                provider_transfer_id: "PRV-RACE",
              }
            : TRANSFER,
        );
      }),
    );
    renderDetail();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Submit transfer" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Submit transfer",
      }),
    );
    expect(
      await screen.findByText("Waiting for provider confirmation"),
    ).toBeVisible();
    expect(screen.getByText("PRV-RACE")).toBeVisible();
  });

  it("retries activity history without hiding transfer information", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).endsWith("/activities/")
          ? Promise.reject(new TypeError("offline"))
          : response(TRANSFER),
      ),
    );
    renderDetail();
    await screen.findByRole("heading", { name: "TRF-8N4K2P" });
    expect(
      await screen.findByText("Activity couldn’t be loaded"),
    ).toBeVisible();
    vi.stubGlobal("fetch", routeFetch());
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Retry/i }));
    expect(await screen.findByText("Transfer created")).toBeVisible();
  });

  it("appends SSE activity once, ignores wrong transfers, and never renders heartbeats", async () => {
    renderDetail();
    await ready();
    const source = MockEventSource.instances[0];
    source.open();
    const completed = {
      ...CREATED,
      id: 12,
      type: "completed",
      source: "provider",
      message: "Provider completed transfer",
      previous_status: "processing",
      new_status: "completed",
      event_id: "evt_1",
      transfer_id: ID,
    } as TransferActivityEvent;
    source.emit({ ...completed, transfer_id: "other" });
    source.emit(completed);
    source.emit(completed);
    expect(
      await screen.findByText("Provider completed transfer"),
    ).toBeVisible();
    expect(screen.getAllByText("Provider completed transfer")).toHaveLength(1);
    expect(screen.queryByText(/keepalive/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit transfer" }),
    ).not.toBeInTheDocument();
  });

  it("resumes from the highest durable cursor and closes on unmount", async () => {
    const view = renderDetail();
    await ready();
    const source = MockEventSource.instances[0];
    expect(source.url).toContain("after=11");
    source.open();
    source.emit({
      ...CREATED,
      id: 14,
      message: "Submitted to provider",
      type: "submitted",
      previous_status: "pending",
      new_status: "processing",
      transfer_id: ID,
    } as TransferActivityEvent);
    source.error();
    view.unmount();
    expect(source.closed).toBe(true);
  });

  it("reconnects after the latest processed durable activity", async () => {
    renderDetail();
    await ready();
    const source = MockEventSource.instances[0];
    source.open();
    source.emit({
      ...CREATED,
      id: 14,
      message: "Submitted to provider",
      type: "submitted",
      previous_status: "pending",
      new_status: "processing",
      transfer_id: ID,
    } as TransferActivityEvent);
    vi.useFakeTimers();
    source.error();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(MockEventSource.instances[1].url).toContain("after=14");
    vi.useRealTimers();
  });

  it("copies the public reference with accessible feedback", async () => {
    renderDetail();
    await ready();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Copy transfer reference" }));
    expect(screen.getByText("Copied")).toBeVisible();
  });

  it("keeps all detail and activity information visible in reduced motion", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    renderDetail();
    await ready();
    expect(screen.getByText("250,000.00")).toBeVisible();
    expect(screen.getByText("Transfer created")).toBeVisible();
    expect(screen.getByLabelText("Transfer lifecycle")).toBeVisible();
  });
});
