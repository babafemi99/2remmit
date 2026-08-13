import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PageLoader } from "./page-loader";

describe("PageLoader", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it("announces the route wait and preserves its message with reduced motion", () => {
    render(
      <PageLoader
        label="Loading transfer…"
        description="Retrieving durable activity."
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading transfer…");
    expect(status).toHaveTextContent("Retrieving durable activity.");
  });
});
