"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      expand
      visibleToasts={3}
      toastOptions={{
        classNames: {
          toast: "app-toast",
          title: "app-toast-title",
          description: "app-toast-description",
          actionButton: "app-toast-action",
          closeButton: "app-toast-close",
        },
      }}
    />
  );
}
