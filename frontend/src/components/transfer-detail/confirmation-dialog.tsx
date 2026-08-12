"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function ConfirmationDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  busyLabel,
  destructive,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  busyLabel?: string;
  destructive?: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current
      ?.querySelector<HTMLElement>("button:not(:disabled)")
      ?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled)",
      ) ?? []),
    ];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="dialog-overlay"
      data-testid="dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={onKeyDown}
      >
        <button
          className="dialog-close"
          type="button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X aria-hidden="true" size={17} weight="bold" />
        </button>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? "danger-button" : "primary-button"}
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <span className="transfer-button-loader" aria-hidden="true">
                <i />
                <i />
              </span>
            ) : null}
            {busy ? (busyLabel ?? "Working…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
