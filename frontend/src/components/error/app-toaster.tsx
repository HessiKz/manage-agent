"use client";

import { Toaster } from "sonner";

/** Global toast host — brand-aligned, RTL-friendly. */
export function AppToaster() {
  return (
    <Toaster
      dir="rtl"
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "font-sans border border-surface-border shadow-card",
          title: "text-stone-900 font-semibold",
          description: "text-stone-600 whitespace-pre-wrap text-sm",
          error: "border-accent-red/30",
          success: "border-accent-green/30",
        },
      }}
    />
  );
}
