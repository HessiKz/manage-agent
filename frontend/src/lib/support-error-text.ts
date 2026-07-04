import { parseApiError } from "@/lib/errors";
import { SupportUiAbortError, SupportUiBlockedError } from "@/lib/support-abort";
import { humanizeCapabilityDenial } from "@/lib/user-capabilities";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ERROR_PATTERNS: Array<{ test: RegExp; message: string }> = [
  {
    test: /badly formed hexadecimal uuid|invalid uuid/i,
    message: "شناسهٔ ایجنت نامعتبر است — لطفاً دوباره تلاش کنید.",
  },
  {
    test: /network error|failed to fetch|networkrequestfailed|load failed/i,
    message: "اتصال برقرار نشد — اینترنت یا سرور را بررسی کنید.",
  },
  {
    test: /no dashboard draft|پیش‌نویس پنل/i,
    message: "پنل هنوز آماده نیست — چند ثانیه صبر کنید و دوباره تلاش کنید.",
  },
  {
    test: /awaiting validation answers|not awaiting validation|Missing answers/i,
    message: "سؤالات برنامه‌ریزی — در حال پاسخ خودکار…",
  },
  {
    test: /agent not found|ایجنت پیدا نشد|یافت نشد/i,
    message: "ایجنت پیدا نشد — شناسه یا نام را بررسی کنید.",
  },
  {
    test: /invalid token|incorrect api key|authenticationerror|api_provider_error/i,
    message:
      "کلید API مدل زبانی نامعتبر یا منقضی است — در ادمین → ارائه‌دهنده مدل، OPENAI_API_KEY را در backend/.env به‌روز کنید یا به cursor-to-api تغییر دهید.",
  },
  {
    test: /401|authentication|unauthorized|وارد شوید/i,
    message: "برای ادامه باید وارد شوید.",
  },
  {
    test: /permission denied to call agent/i,
    message:
      "ایجنت اجازه فراخوانی زیرایجنت را ندارد — دسترسی‌ها را در تنظیمات بررسی کنید.",
  },
  {
    test: /^permission denied$/i,
    message: "اجرای ابزار توسط ایجنت مجاز نبود — دستورالعمل یا دسترسی ابزار را بررسی کنید.",
  },
];

/** Agent wizard grant step — not platform admin denial. */
function isAgentGrantPermissionMessage(message: string): boolean {
  return /دسترسی پیش‌فرض|قبل از شروع تست باید|فعال‌سازی دسترسی پیش‌فرض|حداقل یک کاربر/i.test(
    message
  );
}

/** True only for HTTP/auth superuser denials — not agent-runtime or wizard-grant wording. */
function isPlatformAuthDenied(message: string, details?: unknown): boolean {
  const m = message.trim();
  if (!m || isAgentGrantPermissionMessage(m)) return false;
  if (extractCapability(details)) return true;
  if (/\b403\b/.test(m) || /\bFORBIDDEN\b/i.test(m)) return true;
  if (/superuser privileges required|requires_superuser/i.test(m)) return true;
  if (
    /این عملیات فقط برای ادمین|ساخت ایجنت فقط برای ادمین|فقط برای ادمین پلتفرم|پنل ادمین فقط/i.test(
      m
    )
  ) {
    return true;
  }
  if (/permission denied/i.test(m)) return false;
  if (/\bpermission\b/i.test(m) && /superuser|forbidden|\b403\b|platform admin/i.test(m)) {
    return true;
  }
  if (/\bsuperuser\b/i.test(m) && !/not a superuser/i.test(m)) return true;
  return false;
}

const TOOL_STATUS_FA: Record<string, string> = {
  platform_list_agents: "در حال دریافت فهرست ایجنت‌ها…",
  platform_create_agent: "در حال ساخت ایجنت از طریق ویزارد…",
  platform_continue_agent_testing: "در حال ادامه تست ایجنت…",
  platform_complete_agent_training: "در حال تکمیل آموزش ایجنت…",
  platform_approve_agent_dashboard: "در حال تأیید پنل ایجنت…",
  platform_generate_widget: "در حال ساخت ویجت…",
  platform_open_agent: "در حال باز کردن صفحه ایجنت…",
  platform_execute_ui: "در حال اجرای مراحل رابط کاربری…",
  platform_department_overview: "در حال بررسی دپارتمان…",
  platform_get_user_capabilities: "در حال بررسی دسترسی‌های شما…",
};

function looksLikeEnglishTechnical(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[\u0600-\u06FF]/.test(trimmed)) return false;
  return /^[\x00-\x7F\s]+$/.test(trimmed);
}

function extractCapability(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const cap = (details as Record<string, unknown>).capability;
  return typeof cap === "string" ? cap : null;
}

function humanize403(message: string, details?: unknown): string {
  const cap = extractCapability(details);
  if (cap) return humanizeCapabilityDenial(cap, message);
  if (/superuser|admin|ادمین|create.?agent|ساخت ایجنت/i.test(message)) {
    return humanizeCapabilityDenial("create_agent", message);
  }
  return "دسترسی به این بخش مجاز نیست — اگر ادمین نیستید از مدیر سیستم بخواهید.";
}

/** Map raw tool/status strings from SSE to Persian. */
export function humanizeToolStatus(message: string): string {
  const key = message.trim();
  if (TOOL_STATUS_FA[key]) return TOOL_STATUS_FA[key];
  if (/^platform_/i.test(key)) return "در حال اجرای ابزار پلتفرم…";
  if (looksLikeEnglishTechnical(key)) return "در حال اجرای ابزار…";
  return key || "در حال اجرای ابزار…";
}

/** User-facing Persian text for support flow errors. */
export function humanizeSupportError(err: unknown): string {
  if (err instanceof SupportUiAbortError) {
    if (/انتظار|wait/i.test(err.message)) {
      return "منتظر ماندن متوقف شد — هر وقت آماده بودید دوباره بفرمایید.";
    }
    return "اجرای خودکار متوقف شد — می‌توانید دستور جدید بدهید.";
  }

  if (err instanceof SupportUiBlockedError) {
    return err.blockerText || "مانع در رابط کاربری — اجرا متوقف شد.";
  }

  if (err instanceof Error && err.message.trim()) {
    for (const { test, message } of ERROR_PATTERNS) {
      if (test.test(err.message)) return message;
    }
    if (isPlatformAuthDenied(err.message)) {
      return humanize403(err.message);
    }
    if (looksLikeEnglishTechnical(err.message)) {
      return "خطایی رخ داد — لطفاً دوباره تلاش کنید.";
    }
    return err.message.trim();
  }

  try {
    const apiErr = parseApiError(err);
    for (const { test, message } of ERROR_PATTERNS) {
      if (test.test(apiErr.message)) return message;
    }
    if (apiErr.status === 403 && isPlatformAuthDenied(apiErr.message, apiErr.details)) {
      return humanize403(apiErr.message, apiErr.details);
    }
    if (apiErr.status === 403) {
      return apiErr.message;
    }
    if (apiErr.status >= 500) return "خطای سرور — لطفاً چند لحظه دیگر دوباره تلاش کنید.";
    if (apiErr.status === 400) return "درخواست نامعتبر بود — لطفاً دوباره تلاش کنید.";
    if (looksLikeEnglishTechnical(apiErr.message)) {
      return "خطایی رخ داد — لطفاً دوباره تلاش کنید.";
    }
    return apiErr.message;
  } catch {
    return "خطای ناشناخته — لطفاً دوباره تلاش کنید.";
  }
}

export function isAgentUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}
