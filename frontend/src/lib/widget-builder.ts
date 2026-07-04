import type { DashboardWidgetKind } from "@/lib/api";

export type BuilderWidgetType = "stat_card" | "line_chart" | "pie_chart" | "review_table";

export const BUILDER_WIDGET_TYPES: {
  id: BuilderWidgetType;
  label: string;
  description: string;
  backendKind: DashboardWidgetKind;
}[] = [
  {
    id: "stat_card",
    label: "شاخص کلیدی",
    description: "شاخص عددی با نمودار کوچک",
    backendKind: "stat_cards",
  },
  {
    id: "line_chart",
    label: "نمودار خطی",
    description: "روند زمانی چند سری",
    backendKind: "line_chart",
  },
  {
    id: "pie_chart",
    label: "نمودار دایره‌ای",
    description: "سهم و توزیع",
    backendKind: "pie_chart",
  },
  {
    id: "review_table",
    label: "جدول بازبینی",
    description: "لیست موارد با وضعیت",
    backendKind: "review_table",
  },
];

export const KPI_CHART_VARIANTS = [
  { id: "savings", label: "صرفه‌جویی" },
  { id: "hours", label: "ساعت" },
  { id: "alerts", label: "هشدار" },
  { id: "accuracy", label: "دقت" },
  { id: "payroll-headcount", label: "پرسنل" },
  { id: "payroll-payout", label: "پرداخت" },
] as const;

export type WidgetBuilderOptions = {
  widgetType: BuilderWidgetType;
  title: string;
  description: string;
  chartVariant?: string;
  dataHint?: string;
};

export function buildWidgetPrompt(
  agentName: string,
  options: WidgetBuilderOptions,
  extraNotes?: string
): string {
  const parts: string[] = [];
  const { widgetType, title, description, chartVariant, dataHint } = options;

  if (widgetType === "stat_card") {
    parts.push(`یک کارت KPI برای ایجنت «${agentName}» بساز.`);
    if (title) parts.push(`عنوان KPI: «${title}».`);
    if (description) parts.push(`توضیح: ${description}.`);
    if (chartVariant) parts.push(`نوع نمودار کوچک: ${chartVariant}.`);
    if (dataHint) parts.push(`داده نمونه: ${dataHint}.`);
    parts.push("فقط یک کارت KPI جدید اضافه کن؛ بقیه ویجت‌های موجود را حفظ کن.");
  } else if (widgetType === "line_chart") {
    parts.push(`یک نمودار خطی برای ایجنت «${agentName}» بساز.`);
    if (title) parts.push(`عنوان نمودار: «${title}».`);
    if (description) parts.push(`محتوا: ${description}.`);
    if (dataHint) parts.push(`داده: ${dataHint}.`);
  } else if (widgetType === "pie_chart") {
    parts.push(`یک نمودار دایره‌ای برای ایجنت «${agentName}» بساز.`);
    if (title) parts.push(`عنوان: «${title}».`);
    if (description) parts.push(`محتوا: ${description}.`);
  } else if (widgetType === "review_table") {
    parts.push(`یک جدول بازبینی برای ایجنت «${agentName}» بساز.`);
    if (title) parts.push(`عنوان جدول: «${title}».`);
    if (description) parts.push(`ستون‌ها و ردیف‌ها: ${description}.`);
  }

  if (extraNotes?.trim()) parts.push(extraNotes.trim());
  return parts.join(" ");
}

export function builderTypeFromBackendKind(kind: string): BuilderWidgetType | undefined {
  return BUILDER_WIDGET_TYPES.find((t) => t.backendKind === kind)?.id;
}

export function builderTypeFromDashboardKind(
  kind: DashboardWidgetKind
): BuilderWidgetType | undefined {
  if (kind === "stat_cards") return "stat_card";
  if (kind === "line_chart") return "line_chart";
  if (kind === "pie_chart") return "pie_chart";
  if (kind === "review_table") return "review_table";
  return undefined;
}

export function backendKindForBuilder(type: BuilderWidgetType): DashboardWidgetKind {
  return BUILDER_WIDGET_TYPES.find((t) => t.id === type)?.backendKind ?? "stat_cards";
}

/** Default generation prompt when support/user opens auto-generate without explicit text. */
export function defaultWidgetGeneratePrompt(
  agentName: string,
  widgetType: BuilderWidgetType
): string {
  const name = agentName || "ایجنت";
  if (widgetType === "stat_card") {
    return (
      `برای ایجنت «${name}» پنل KPI با عنوان «شاخص‌های کلیدی ${name}» بساز. ` +
      "کارت‌ها: تعداد اجرا (امروز)، نرخ موفقیت، میانگین زمان پاسخ، " +
      "کاربران فعال هفته، آخرین اجرا، رضایت کاربر. داده نمونه واقع‌گرایانه."
    );
  }
  if (widgetType === "line_chart") {
    return `نمودار خطی روند فعالیت «${name}» در ۷ روز اخیر.`;
  }
  if (widgetType === "pie_chart") {
    return `نمودار دایره‌ای توزیع نتایج برای «${name}».`;
  }
  return `جدول بازبینی موارد نیازمند تأیید برای «${name}».`;
}

export function defaultWidgetTitle(agentName: string, widgetType: BuilderWidgetType): string {
  const name = agentName || "ایجنت";
  if (widgetType === "stat_card") return `شاخص‌های کلیدی ${name}`;
  if (widgetType === "line_chart") return `روند فعالیت ${name}`;
  if (widgetType === "pie_chart") return `توزیع نتایج ${name}`;
  return `موارد بازبینی ${name}`;
}
