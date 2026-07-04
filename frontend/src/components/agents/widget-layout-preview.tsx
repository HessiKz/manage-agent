"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  isWidgetEnabledInPlan,
  WIDGET_PLAN_LABELS,
  WIDGET_PLAN_META,
  type AgentWidgetPlan,
} from "@/lib/widget-plan";
import type { DashboardWidgetKind } from "@/lib/api";

type Props = {
  plan: AgentWidgetPlan;
  className?: string;
  /** Hide review_table slot and caption (widgets wizard step). */
  hideReviewSection?: boolean;
};

function Slot({
  kind,
  enabled,
  className,
  children,
}: {
  kind: DashboardWidgetKind;
  enabled: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const meta = WIDGET_PLAN_META[kind];
  return (
    <div
      className={cn(
        "rounded-lg border px-2 py-1.5 text-center transition-colors",
        enabled
          ? "border-brand-300 bg-brand-50/80 text-brand-900"
          : "border-dashed border-stone-200 bg-stone-50/50 text-stone-400",
        className
      )}
      title={meta.positionLabel}
    >
      <p className="text-[10px] font-semibold leading-tight">
        {WIDGET_PLAN_LABELS[kind]}
      </p>
      {children}
    </div>
  );
}

/** Schematic of agent dashboard layout — highlights widgets enabled in the plan. */
export function WidgetLayoutPreview({ plan, className, hideReviewSection = false }: Props) {
  const enabled = useMemo(
    () => ({
      hr: isWidgetEnabledInPlan(plan, "hr_savings"),
      kpi: isWidgetEnabledInPlan(plan, "stat_cards"),
      line: isWidgetEnabledInPlan(plan, "line_chart"),
      pie: isWidgetEnabledInPlan(plan, "pie_chart"),
      review: isWidgetEnabledInPlan(plan, "review_table"),
    }),
    [plan]
  );

  const activeCount =
    Number(enabled.hr) +
    Number(enabled.kpi) +
    Number(enabled.line) +
    Number(enabled.pie) +
    (hideReviewSection ? 0 : Number(enabled.review));

  return (
    <div
      className={cn(
        "rounded-2xl border border-stone-200 bg-white p-4",
        className
      )}
      aria-label="نقشه چیدمان پنل ایجنت"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-stone-800">نقشه چیدمان پنل</p>
        <p className="text-[10px] text-stone-500">
          {activeCount > 0 ? `${activeCount} بخش فعال` : "هنوز ویجتی انتخاب نشده"}
        </p>
      </div>

      <div className="space-y-2 text-[10px]">
        <Slot kind="hr_savings" enabled={enabled.hr} className="py-2">
          {enabled.hr ? (
            <span className="text-[9px] text-brand-700">نوار صرفه‌جویی</span>
          ) : (
            <span className="text-[9px]">غیرفعال</span>
          )}
        </Slot>

        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Slot
              key={i}
              kind="stat_cards"
              enabled={enabled.kpi}
              className={cn(!enabled.kpi && i > 0 && "opacity-40")}
            >
              {enabled.kpi && i === 0 ? (
                <span className="text-[9px] text-brand-700">KPI</span>
              ) : null}
            </Slot>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1">
          <Slot kind="line_chart" enabled={enabled.line}>
            {enabled.line ? (
              <span className="text-[9px] text-brand-700">روند</span>
            ) : (
              <span className="text-[9px]">خاموش</span>
            )}
          </Slot>
          <Slot kind="pie_chart" enabled={enabled.pie}>
            {enabled.pie ? (
              <span className="text-[9px] text-brand-700">سهم</span>
            ) : (
              <span className="text-[9px]">خاموش</span>
            )}
          </Slot>
        </div>

        {!hideReviewSection && (
          <Slot kind="review_table" enabled={enabled.review} className="py-2">
            {enabled.review ? (
              <span className="text-[9px] text-brand-700">جدول بازبینی</span>
            ) : (
              <span className="text-[9px]">در گام «هشدار و بازبینی»</span>
            )}
          </Slot>
        )}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-stone-500">
        {hideReviewSection
          ? "از بالا به پایین: ابتدا صرفه‌جویی (اختیاری)، سپس کارت‌های KPI، و نمودارها در دو ستون."
          : "از بالا به پایین: ابتدا صرفه‌جویی (اختیاری)، سپس کارت‌های KPI، نمودارها در دو ستون، و در پایان جدول بازبینی."}
      </p>
    </div>
  );
}
