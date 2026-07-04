import type { DashboardWidgetKind } from "@/lib/api";

export type ReviewAlertRule = {
  description: string;
  threshold: string;
};

export type ReviewWidgetSpec = {
  enabled: boolean;
  title?: string;
  /** Legacy / LLM hint — kept in sync with alert_rules. */
  scope?: string;
  alert_rules?: ReviewAlertRule[];
};

export type StatCardsWidgetSpec = {
  enabled: boolean;
  hints?: string[];
};

export type ChartWidgetSpec = {
  enabled: boolean;
  hint?: string;
};

export type HrSavingsWidgetSpec = {
  enabled: boolean;
};

export type AgentWidgetPlan = {
  stat_cards: StatCardsWidgetSpec;
  line_chart: ChartWidgetSpec;
  pie_chart: ChartWidgetSpec;
  review_table: ReviewWidgetSpec;
  hr_savings: HrSavingsWidgetSpec;
};

export const WIDGET_PLAN_LABELS: Record<DashboardWidgetKind, string> = {
  stat_cards: "شاخص کلیدی",
  line_chart: "نمودار خطی",
  pie_chart: "نمودار دایره‌ای",
  review_table: "جدول بازبینی",
  hr_savings: "صرفه‌جویی HR",
};

/** Where each widget sits on the agent dashboard (top → bottom). */
export type WidgetLayoutZone =
  | "top_banner"
  | "kpi_row"
  | "charts_row"
  | "full_width";

export type WidgetPlanMeta = {
  zone: WidgetLayoutZone;
  zoneOrder: number;
  positionLabel: string;
  summary: string;
  example: string;
  configuredInWizard: boolean;
  wizardStep?: string;
};

export const WIDGET_PLAN_META: Record<DashboardWidgetKind, WidgetPlanMeta> = {
  hr_savings: {
    zone: "top_banner",
    zoneOrder: 0,
    positionLabel: "بالای پنل — نوار خلاصه",
    summary: "نمایش تخمین ساعت و هزینه‌ای که ایجنت جایگزین کار دستی کرده است.",
    example: "«۴۲ ساعت صرفه‌جویی این ماه»",
    configuredInWizard: true,
  },
  stat_cards: {
    zone: "kpi_row",
    zoneOrder: 1,
    positionLabel: "ردیف اول — کارت‌های شاخص",
    summary: "۳ تا ۴ عدد کلیدی که وضعیت کار ایجنت را یک‌نگاه نشان می‌دهد.",
    example: "«۱۲۴ پرونده باز» · «میانگین ۲ ساعت پاسخ»",
    configuredInWizard: true,
  },
  line_chart: {
    zone: "charts_row",
    zoneOrder: 2,
    positionLabel: "وسط پنل — ستون راست نمودارها",
    summary: "روند تغییر یک شاخص در زمان (روزانه یا ماهانه).",
    example: "تعداد پردازش ماهانه در ۶ ماه اخیر",
    configuredInWizard: true,
  },
  pie_chart: {
    zone: "charts_row",
    zoneOrder: 3,
    positionLabel: "وسط پنل — ستون چپ نمودارها",
    summary: "سهم هر دسته از کل (وضعیت‌ها، انواع درخواست و …).",
    example: "توزیع وضعیت درخواست‌ها: باز · در حال بررسی · بسته",
    configuredInWizard: true,
  },
  review_table: {
    zone: "full_width",
    zoneOrder: 4,
    positionLabel: "پایین پنل — جدول تمام‌عرض",
    summary: "لیست مواردی که انسان باید تأیید یا رد کند؛ با قوانین هشدار از گام «هشدار و بازبینی».",
    example: "فاکتورهای بالای ۱۰ میلیون · قراردادهای منقضی‌شده",
    configuredInWizard: false,
    wizardStep: "هشدار و بازبینی",
  },
};

/** KPI / chart widgets configured on the «ویجت‌های پنل» step. */
export const WIZARD_KPI_WIDGETS: DashboardWidgetKind[] = [
  "stat_cards",
  "line_chart",
  "pie_chart",
  "hr_savings",
];

export function parseReviewAlertRules(spec: ReviewWidgetSpec): ReviewAlertRule[] {
  if (spec.alert_rules?.length) {
    return spec.alert_rules;
  }
  if (spec.scope?.trim()) {
    return spec.scope
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(.+?)\s*[—–-]\s*آستانه:\s*(.+)$/);
        if (m) return { description: m[1].trim(), threshold: m[2].trim() };
        return { description: line, threshold: "" };
      });
  }
  return [{ description: "", threshold: "" }];
}

export function serializeReviewScope(rules: ReviewAlertRule[]): string {
  return rules
    .filter((r) => r.description.trim())
    .map((r) => {
      const d = r.description.trim();
      const t = r.threshold.trim();
      return t ? `${d} — آستانه: ${t}` : d;
    })
    .join("\n");
}

export function patchReviewTable(
  spec: ReviewWidgetSpec,
  patch: Partial<ReviewWidgetSpec>
): ReviewWidgetSpec {
  const next: ReviewWidgetSpec = { ...spec, ...patch };
  if (patch.alert_rules) {
    next.scope = serializeReviewScope(patch.alert_rules);
  }
  return next;
}

export function validateReviewAlertsPlan(plan: AgentWidgetPlan): string | null {
  if (!plan.review_table.enabled) return null;
  if (!(plan.review_table.title ?? "").trim()) {
    return "عنوان جدول بازبینی را وارد کنید.";
  }
  const rules = parseReviewAlertRules(plan.review_table).filter((r) => r.description.trim());
  if (!rules.length) {
    return "حداقل یک قانون هشدار با شرح مورد تعریف کنید.";
  }
  return null;
}

export function defaultWidgetPlan(department?: string): AgentWidgetPlan {
  const hr = department === "hr" || department === "human_resources" || department === "payroll";
  return {
    stat_cards: { enabled: false, hints: [] },
    line_chart: { enabled: false, hint: "" },
    pie_chart: { enabled: false, hint: "" },
    review_table: { enabled: false, title: "", scope: "", alert_rules: [] },
    hr_savings: { enabled: hr },
  };
}

export function parseWidgetPlan(
  configJson?: Record<string, unknown> | null,
  department?: string,
  description?: string
): AgentWidgetPlan {
  if (!configJson?.widget_plan) {
    const hr =
      department === "hr" || department === "human_resources" || department === "payroll";
    return {
      stat_cards: { enabled: false, hints: [] },
      line_chart: { enabled: false, hint: "" },
      pie_chart: { enabled: false, hint: "" },
      review_table: { enabled: false, title: "", scope: description ?? "", alert_rules: [] },
      hr_savings: { enabled: hr },
    };
  }
  const raw = configJson.widget_plan;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const p = raw as Record<string, unknown>;
    const base = defaultWidgetPlan(department);
    return {
      stat_cards: { ...base.stat_cards, ...(p.stat_cards as object) },
      line_chart: { ...base.line_chart, ...(p.line_chart as object) },
      pie_chart: { ...base.pie_chart, ...(p.pie_chart as object) },
      review_table: {
        ...base.review_table,
        ...(p.review_table as object),
        alert_rules: parseReviewAlertRules({
          ...base.review_table,
          ...(p.review_table as ReviewWidgetSpec),
        }),
      },
      hr_savings: { ...base.hr_savings, ...(p.hr_savings as object) },
    };
  }
  return defaultWidgetPlan(department);
}

export function isWidgetEnabledInPlan(plan: AgentWidgetPlan, kind: DashboardWidgetKind): boolean {
  switch (kind) {
    case "stat_cards":
      return plan.stat_cards.enabled;
    case "line_chart":
      return plan.line_chart.enabled;
    case "pie_chart":
      return plan.pie_chart.enabled;
    case "review_table":
      return plan.review_table.enabled;
    case "hr_savings":
      return plan.hr_savings.enabled;
    default:
      return false;
  }
}

export function sanitizeWidgetPlanForPublish(plan: AgentWidgetPlan): AgentWidgetPlan {
  if (!plan.review_table.enabled) {
    return {
      ...plan,
      review_table: patchReviewTable(plan.review_table, {
        enabled: false,
        alert_rules: [],
        scope: "",
      }),
    };
  }
  const rules = parseReviewAlertRules(plan.review_table).filter((r) => r.description.trim());
  return {
    ...plan,
    review_table: patchReviewTable(plan.review_table, { alert_rules: rules }),
  };
}

export function widgetPlanToConfigJson(plan: AgentWidgetPlan): Record<string, unknown> {
  const sanitized = sanitizeWidgetPlanForPublish(plan);
  const review_table = patchReviewTable(sanitized.review_table, {
    alert_rules: parseReviewAlertRules(sanitized.review_table).filter((r) =>
      r.description.trim()
    ),
  });
  return { widget_plan: { ...sanitized, review_table } };
}

export function enabledWidgetPlanSummary(plan: AgentWidgetPlan): string[] {
  return (Object.keys(WIDGET_PLAN_LABELS) as DashboardWidgetKind[])
    .filter((k) => isWidgetEnabledInPlan(plan, k))
    .map((k) => WIDGET_PLAN_LABELS[k]);
}
