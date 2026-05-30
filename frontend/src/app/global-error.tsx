"use client";

import { useEffect } from "react";
import { clientLog } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLog("error", error.message, {
      event: "next.global_error",
      error,
      context: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen bg-surface-muted font-sans p-6">
        <div className="mx-auto max-w-md rounded-xl border border-surface-border bg-white p-8 text-center shadow-card">
          <h1 className="text-xl font-bold text-stone-900">خطای بحرانی</h1>
          <p className="mt-2 text-sm text-stone-600">{error.message}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            بارگذاری مجدد
          </button>
        </div>
      </body>
    </html>
  );
}
