import type { DashboardWidgetKind } from "@/lib/api";
import type { SupportUserChoice } from "@/lib/chat-message-types";

const WIDGET_LABEL_TO_KIND: Record<string, DashboardWidgetKind> = {
  "کارت KPI": "stat_cards",
  "شاخص کلیدی": "stat_cards",
  stat_cards: "stat_cards",
  "نمودار خطی": "line_chart",
  line_chart: "line_chart",
  "نمودار دایره‌ای": "pie_chart",
  pie_chart: "pie_chart",
  "جدول بازبینی": "review_table",
  review_table: "review_table",
  "صرفه‌جویی نیروی انسانی": "hr_savings",
  hr_savings: "hr_savings",
};

export function parseDisabledWidgetFromError(message: string): DashboardWidgetKind | null {
  const match = message.match(/ویجت «([^»]+)» در مرحله ساخت ایجنت فعال نشده/u);
  if (!match?.[1]) return null;
  return WIDGET_LABEL_TO_KIND[match[1].trim()] ?? null;
}

export function buildSupportErrorChoices(message: string): SupportUserChoice[] {
  const widgetKind = parseDisabledWidgetFromError(message);
  if (widgetKind) {
    const label =
      widgetKind === "stat_cards"
        ? "کارت KPI"
        : widgetKind === "line_chart"
          ? "نمودار خطی"
          : widgetKind === "pie_chart"
            ? "نمودار دایره‌ای"
            : widgetKind === "review_table"
              ? "جدول بازبینی"
              : "ویجت";
    return [
      {
        id: `enable_widget:${widgetKind}`,
        label: `خودت فعالش کن (${label})`,
        description: "ویجت را در برنامه پنل ایجنت روشن می‌کنم و دوباره تلاش می‌کنم.",
        tone: "primary",
      },
      {
        id: `skip_widget:${widgetKind}`,
        label: "این مرحله را رد کن",
        description: "بدون این ویجت ادامه می‌دهم.",
        tone: "secondary",
      },
      {
        id: "manual_fix",
        label: "خودم در ویزارد انجام می‌دهم",
        description: "منتظر می‌مانم تا شما ویجت را در ویزارد روشن کنید.",
        tone: "ghost",
      },
    ];
  }

  if (/سؤالات برنامه‌ریزی|برنامه‌ریزی تست|wizard-planning|planning/i.test(message)) {
    return [
      {
        id: "auto_planning",
        label: "خودت جواب بده و ادامه بده",
        description: "پاسخ‌های پیش‌فرض را ثبت می‌کنم و تست را ادامه می‌دهم.",
        tone: "primary",
      },
      {
        id: "manual_planning",
        label: "خودم جواب می‌دهم",
        description: "منتظر می‌مانم تا شما سؤالات روی صفحه را پر کنید.",
        tone: "secondary",
      },
      {
        id: "user_prompt",
        label: "راهنمایی بده چه بنویسم",
        tone: "ghost",
      },
    ];
  }

  if (/حداقل یک کاربر|دسترسی پیش‌فرض|permissions/i.test(message)) {
    return [
      {
        id: "auto_permissions",
        label: "خودت دسترسی پیش‌فرض را بزن",
        description: "تیک «دسترسی پیش‌فرض سازمان» را برایتان فعال می‌کنم.",
        tone: "primary",
      },
      {
        id: "manual_fix",
        label: "خودم انتخاب می‌کنم",
        tone: "ghost",
      },
    ];
  }

  return [
    {
      id: "retry",
      label: "دوباره تلاش کن",
      tone: "primary",
    },
    {
      id: "manual_fix",
      label: "راهنمایی بده چه کار کنم",
      tone: "secondary",
    },
  ];
}

export function formatSupportErrorWithChoices(message: string): string {
  const widgetKind = parseDisabledWidgetFromError(message);
  if (widgetKind) {
    return (
      `⚠ ${message}\n\n` +
      "برای ادامه یکی از گزینه‌های زیر را بزنید — می‌توانم خودم ویجت را فعال کنم یا این مرحله را رد کنم."
    );
  }
  return `⚠ ${message}\n\nبرای ادامه یکی از گزینه‌های زیر را انتخاب کنید.`;
}

const SKIP_WIDGET_KEY = "ma_support_skip_widget";

export function markWidgetStepSkipped(kind: DashboardWidgetKind): void {
  try {
    sessionStorage.setItem(`${SKIP_WIDGET_KEY}:${kind}`, "1");
  } catch {
    /* private mode */
  }
}

export function isWidgetStepSkipped(kind: DashboardWidgetKind): boolean {
  try {
    return sessionStorage.getItem(`${SKIP_WIDGET_KEY}:${kind}`) === "1";
  } catch {
    return false;
  }
}

export function clearWidgetStepSkip(kind: DashboardWidgetKind): void {
  try {
    sessionStorage.removeItem(`${SKIP_WIDGET_KEY}:${kind}`);
  } catch {
    /* ignore */
  }
}

export function parseChoiceWidgetKind(choiceId: string): DashboardWidgetKind | null {
  const m = choiceId.match(/^enable_widget:([a-z_]+)$|^skip_widget:([a-z_]+)$/);
  const kind = m?.[1] ?? m?.[2];
  if (!kind) return null;
  if (kind in WIDGET_LABEL_TO_KIND || kind.includes("_")) {
    return kind as DashboardWidgetKind;
  }
  return null;
}
