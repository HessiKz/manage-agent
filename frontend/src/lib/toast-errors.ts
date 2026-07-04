"use client";

import { toast } from "sonner";
import { ApiError, formatFieldErrors, parseApiError } from "@/lib/errors";

const TOAST_TITLE_BY_CODE: Record<string, string> = {
  LLM_UNAVAILABLE: "سرویس هوش مصنوعی",
  RATE_LIMITED: "محدودیت درخواست",
  AUTHENTICATION_REQUIRED: "ورود",
  PERMISSION_DENIED: "دسترسی",
  VALIDATION_ERROR: "ورودی نامعتبر",
  SERVICE_UNAVAILABLE: "سرویس در دسترس نیست",
  INTERNAL_ERROR: "خطای سرور",
};

const TOAST_TITLE_BY_STATUS: Record<number, string> = {
  429: "محدودیت درخواست",
  500: "خطای سرور",
  503: "سرویس در دسترس نیست",
};

let lastToastKey = "";
let lastToastAt = 0;
const DEDUPE_MS = 2500;

function toastTitleFor(apiErr: ApiError, override?: string): string {
  if (override) return override;
  return (
    TOAST_TITLE_BY_CODE[apiErr.code] ??
    TOAST_TITLE_BY_STATUS[apiErr.status] ??
    "خطا"
  );
}

function toastDescription(apiErr: ApiError): string {
  const fields = formatFieldErrors(apiErr);
  if (fields) return `${apiErr.message}\n${fields}`;
  if (apiErr.requestId) {
    return `${apiErr.message}\nشناسه درخواست: ${apiErr.requestId}`;
  }
  return apiErr.message;
}

export function showErrorToast(error: unknown, title?: string) {
  const apiErr = parseApiError(error);
  const key = `${apiErr.status}:${apiErr.code}:${apiErr.message}`;
  const now = Date.now();
  if (key === lastToastKey && now - lastToastAt < DEDUPE_MS) return;
  lastToastKey = key;
  lastToastAt = now;

  toast.error(toastTitleFor(apiErr, title), {
    description: toastDescription(apiErr),
    duration: apiErr.status === 429 ? 8000 : 6000,
  });
}

export function showApiError(error: ApiError) {
  showErrorToast(error);
}
