import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmationDialog } from "./confirmation-dialog";

afterEach(() => cleanup());

function renderDialog(overrides = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const view = render(
    <>
      <button type="button">Trigger</button>
      <ConfirmationDialog
        title="Confirm action?"
        description="This action changes the transfer."
        cancelLabel="Keep transfer"
        confirmLabel="Confirm"
        busy={false}
        onClose={onClose}
        onConfirm={onConfirm}
        {...overrides}
      />
    </>,
  );
  return { ...view, onClose, onConfirm };
}

describe("ConfirmationDialog", () => {
  it("renders as a centred modal overlay and locks background scroll", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Confirm action?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.parentElement).toHaveClass("dialog-overlay");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("confirms and cancels through explicit actions", async () => {
    const user = userEvent.setup();
    const { onClose, onConfirm } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Keep transfer" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("dismisses with Escape and the overlay, then restores focus", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { onClose, unmount } = renderDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.mouseDown(screen.getByTestId("dialog-overlay"));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("traps keyboard focus within its controls", () => {
    renderDialog();
    const close = screen.getByRole("button", { name: "Close dialog" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    confirm.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Tab",
      shiftKey: true,
    });
    expect(confirm).toHaveFocus();
  });
});
