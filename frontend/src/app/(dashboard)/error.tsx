"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error/error-fallback";
import { clientLog } from "@/lib/logger";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLog("error", error.message, {
      event: "next.dashboard_error",
      error,
      context: { digest: error.digest },
    });
  }, [error]);

  return <ErrorFallback error={error} onRetry={reset} segment="dashboard" />;
}
