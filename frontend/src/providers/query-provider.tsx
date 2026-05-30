"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { parseApiError } from "@/lib/errors";
import { logApiError } from "@/lib/logger";
import { showErrorToast } from "@/lib/toast-errors";
import { MotionProvider } from "./motion-provider";

function shouldToastQueryError(error: unknown): boolean {
  const apiErr = parseApiError(error);
  if (apiErr.status === 401) return false;
  return true;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            logApiError(error, "query.error");
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            logApiError(error, "mutation.error");
            if (shouldToastQueryError(error)) showErrorToast(error);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              const status = parseApiError(error).status;
              if (status === 401 || status === 403 || status === 404) return false;
              return failureCount < 1;
            },
          },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <MotionProvider>{children}</MotionProvider>
    </QueryClientProvider>
  );
}
