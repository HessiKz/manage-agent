"use client";

import { ApiError, parseApiError } from "@/lib/errors";
import { clientLog } from "@/lib/logger";
import { showErrorToast } from "@/lib/toast-errors";

export type HandleApiErrorOptions = {
  event?: string;
  /** Show a Sonner toast (default false — opt in per call site). */
  toast?: boolean;
  toastTitle?: string;
  /** Send to remote client log + dev console (default true). */
  log?: boolean;
};

/** Normalize, optionally log + toast, return ApiError for local UI state. */
export function handleApiError(
  error: unknown,
  opts: HandleApiErrorOptions = {}
): ApiError {
  const apiErr = parseApiError(error);
  const {
    event = "api.error",
    toast = false,
    toastTitle,
    log = true,
  } = opts;

  if (log) {
    // Use warn on console — console.error triggers Next.js dev error overlay.
    clientLog("warn", apiErr.message, {
      event,
      context: {
        status: apiErr.status,
        code: apiErr.code,
        requestId: apiErr.requestId,
      },
      remoteLevel: apiErr.status >= 500 ? "error" : "warn",
    });
  }

  if (toast && apiErr.status !== 401) {
    showErrorToast(apiErr, toastTitle);
  }

  return apiErr;
}

/** @deprecated Prefer handleApiError — kept for existing imports. */
export function logApiError(error: unknown, event = "api.error"): ApiError {
  return handleApiError(error, { event, log: true, toast: false });
}
