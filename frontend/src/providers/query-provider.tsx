"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { handleApiError } from "@/lib/api-error-handler";
import { parseApiError } from "@/lib/errors";
import { MotionProvider } from "./motion-provider";

function shouldToastQueryError(error: unknown): boolean {
  const apiErr = parseApiError(error);
  if (apiErr.status === 401 || apiErr.status === 403 || apiErr.status === 0) return false;
  return true;
}

function shouldLogQueryError(error: unknown): boolean {
  const apiErr = parseApiError(error);
  if (apiErr.status === 401 || apiErr.status === 403 || apiErr.status === 0) return false;
  return true;
}

function metaSuppressesToast(meta: unknown): boolean {
  return Boolean(
    meta &&
      typeof meta === "object" &&
      "suppressErrorToast" in meta &&
      (meta as { suppressErrorToast?: boolean }).suppressErrorToast
  );
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            handleApiError(error, {
              event: "query.error",
              log: shouldLogQueryError(error),
              toast:
                !metaSuppressesToast(query.meta) && shouldToastQueryError(error),
            });
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            handleApiError(error, {
              event: "mutation.error",
              log: shouldLogQueryError(error),
              toast:
                !metaSuppressesToast(mutation.meta) && shouldToastQueryError(error),
            });
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
