import type { AxiosError } from "axios";

/** Mirrors backend `ApiErrorBody`. */
export type ApiErrorBody = {
  error?: boolean;
  code?: string;
  message?: string;
  request_id?: string | null;
  details?: unknown;
  errors?: Array<{ field: string; message: string; code?: string | null }>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: unknown;
  readonly fieldErrors: ApiErrorBody["errors"];

  constructor(
    message: string,
    opts: {
      status: number;
      code?: string;
      requestId?: string | null;
      details?: unknown;
      fieldErrors?: ApiErrorBody["errors"];
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code ?? statusToCode(opts.status);
    this.requestId = opts.requestId ?? null;
    this.details = opts.details;
    this.fieldErrors = opts.fieldErrors;
  }
}

const STATUS_MESSAGE_FA: Record<number, string> = {
  400: "درخواست نامعتبر است.",
  401: "برای ادامه باید وارد شوید.",
  403: "دسترسی به این بخش مجاز نیست.",
  404: "مورد درخواستی یافت نشد.",
  409: "تداخل داده — این مورد از قبل وجود دارد.",
  422: "ورودی ارسالی معتبر نیست.",
  429: "تعداد درخواست‌ها زیاد است. کمی صبر کنید.",
  500: "خطای داخلی سرور. لطفاً دوباره تلاش کنید.",
  503: "سرویس موقتاً در دسترس نیست.",
};

function statusToCode(status: number): string {
  const map: Record<number, string> = {
    401: "AUTHENTICATION_REQUIRED",
    403: "PERMISSION_DENIED",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    503: "SERVICE_UNAVAILABLE",
    500: "INTERNAL_ERROR",
  };
  return map[status] ?? "BAD_REQUEST";
}

function extractLegacyDetail(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.message === "string") return d.message;
  if (typeof d.detail === "string") return d.detail;
  if (Array.isArray(d.detail)) {
    return d.detail
      .map((item) => {
        if (typeof item === "object" && item && "msg" in item) {
          return String((item as { msg: string }).msg);
        }
        return String(item);
      })
      .join(" — ");
  }
  return null;
}

export function parseApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const data = error.response?.data as ApiErrorBody | undefined;
    const requestId =
      data?.request_id ??
      (error.response?.headers?.["x-request-id"] as string | undefined) ??
      null;

    if (data?.message || data?.code) {
      return new ApiError(data.message ?? STATUS_MESSAGE_FA[status] ?? "خطای ناشناخته", {
        status: status || 500,
        code: data.code,
        requestId,
        details: data.details,
        fieldErrors: data.errors,
      });
    }

    const legacy = extractLegacyDetail(data);
    const message =
      legacy ?? STATUS_MESSAGE_FA[status] ?? error.message ?? "خطای ناشناخته";
    return new ApiError(message, { status, requestId });
  }

  if (error instanceof Error) {
    return new ApiError(error.message, { status: 500, code: "CLIENT_ERROR" });
  }

  return new ApiError("خطای ناشناخته", { status: 500, code: "UNKNOWN" });
}

export function getErrorMessage(error: unknown): string {
  return parseApiError(error).message;
}

export function formatFieldErrors(error: ApiError): string | null {
  if (!error.fieldErrors?.length) return null;
  return error.fieldErrors.map((e) => `${e.field}: ${e.message}`).join("\n");
}

function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === "object" &&
    error !== null &&
    "isAxiosError" in error &&
    (error as AxiosError).isAxiosError === true
  );
}
