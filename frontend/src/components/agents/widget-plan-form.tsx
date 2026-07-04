"use client";

import { LayoutDashboard } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { Input, Textarea } from "@/components/ui/input";
import { WizardField } from "@/components/agents/wizard-field";
import { WidgetLayoutPreview } from "@/components/agents/widget-layout-preview";
import {
  defaultWidgetPlan,
  WIDGET_PLAN_LABELS,
  WIDGET_PLAN_META,
  WIZARD_KPI_WIDGETS,
  type AgentWidgetPlan,
} from "@/lib/widget-plan";
import type { DashboardWidgetKind } from "@/lib/api";

type Props = {
  value: AgentWidgetPlan;
  onChange: (plan: AgentWidgetPlan) => void;
  department?: string;
};

function patchPlan(value: AgentWidgetPlan, patch: Partial<AgentWidgetPlan>): AgentWidgetPlan {
  return { ...value, ...patch };
}

export function WidgetPlanForm({ value, onChange, department }: Props) {
  const plan = value ?? defaultWidgetPlan(department);

  function toggle(kind: DashboardWidgetKind, enabled: boolean) {
    if (kind === "stat_cards") {
      onChange(patchPlan(plan, { stat_cards: { ...plan.stat_cards, enabled } }));
    } else if (kind === "line_chart") {
      onChange(patchPlan(plan, { line_chart: { ...plan.line_chart, enabled } }));
    } else if (kind === "pie_chart") {
      onChange(patchPlan(plan, { pie_chart: { ...plan.pie_chart, enabled } }));
    } else if (kind === "hr_savings") {
      onChange(patchPlan(plan, { hr_savings: { enabled } }));
    }
  }

  function isEnabled(kind: DashboardWidgetKind): boolean {
    if (kind === "stat_cards") return plan.stat_cards.enabled;
    if (kind === "line_chart") return plan.line_chart.enabled;
    if (kind === "pie_chart") return plan.pie_chart.enabled;
    return plan.hr_savings.enabled;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3">
        <div className="flex gap-3">
          <LayoutDashboard className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
          <div className="space-y-2 text-sm leading-relaxed text-stone-700">
            <p className="font-semibold text-stone-900">پنل ایجنت چیست؟</p>
            <p>
              هر ایجنت یک <strong>صفحهٔ اختصاصی</strong> دارد که شاخص‌ها و نمودارهای کارش را نشان
              می‌دهد. اینجا فقط مشخص می‌کنید <strong>چه نوع ویجتی</strong> در آن صفحه باشد — نه
              محتوای دقیق اعداد.
            </p>
            <ol className="list-inside list-decimal space-y-1 text-xs text-stone-600">
              <li>ویجت‌های مورد نیاز را روشن کنید و در صورت تمایل راهنمای کوتاه بنویسید.</li>
              <li>
                بعد از «شروع تست»، هوش مصنوعی بر اساس نقش ایجنت <strong>پیش‌نمایش واقعی</strong>{" "}
                می‌سازد.
              </li>
              <li>در مرحلهٔ طراحی پنل، هر ویجت را تأیید، ویرایش یا رد می‌کنید.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(200px,260px)]">
        <Stagger initial={false} className="space-y-2">
          {WIZARD_KPI_WIDGETS.map((kind) => {
            const enabled = isEnabled(kind);
            const meta = WIDGET_PLAN_META[kind];

            return (
              <StaggerItem key={kind} variant="slideUp">
                <div
                  className={
                    enabled
                      ? "rounded-xl border border-brand-200 bg-white px-4 py-3 shadow-sm"
                      : "rounded-xl border border-stone-200 bg-white px-4 py-3"
                  }
                >
                  <label className="flex cursor-pointer items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-stone-800">
                          {WIDGET_PLAN_LABELS[kind]}
                        </p>
                        <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
                          {meta.positionLabel}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-stone-600">{meta.summary}</p>
                      <p className="text-[10px] text-stone-400">مثال: {meta.example}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => toggle(kind, e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                    />
                  </label>

                  {kind === "stat_cards" && plan.stat_cards.enabled && (
                    <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
                      <WizardField
                        label="راهنمای KPI (اختیاری)"
                        hint="هر خط یک شاخص پیشنهادی — AI هنگام ساخت پنل از این‌ها الهام می‌گیرد"
                      >
                        <Textarea
                          rows={3}
                          value={(plan.stat_cards.hints ?? []).join("\n")}
                          onChange={(e) =>
                            onChange(
                              patchPlan(plan, {
                                stat_cards: {
                                  ...plan.stat_cards,
                                  hints: e.target.value
                                    .split("\n")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                },
                              })
                            )
                          }
                          placeholder={
                            "تعداد پرونده‌های باز\nمیانگین زمان پاسخ\nنرخ خطا در پردازش"
                          }
                        />
                      </WizardField>
                    </div>
                  )}

                  {kind === "line_chart" && plan.line_chart.enabled && (
                    <div className="mt-3 border-t border-stone-100 pt-3">
                      <WizardField
                        label="چه روندی نمایش داده شود؟ (اختیاری)"
                        hint="AI عنوان و دادهٔ نمودار را بر اساس این راهنما می‌سازد"
                      >
                        <Input
                          value={plan.line_chart.hint ?? ""}
                          onChange={(e) =>
                            onChange(
                              patchPlan(plan, {
                                line_chart: { ...plan.line_chart, hint: e.target.value },
                              })
                            )
                          }
                          placeholder="مثلاً: تعداد پردازش ماهانه"
                        />
                      </WizardField>
                    </div>
                  )}

                  {kind === "pie_chart" && plan.pie_chart.enabled && (
                    <div className="mt-3 border-t border-stone-100 pt-3">
                      <WizardField
                        label="چه توزیعی نمایش داده شود؟ (اختیاری)"
                        hint="دسته‌بندی‌هایی که سهم هر کدام در نمودار دایره‌ای دیده شود"
                      >
                        <Input
                          value={plan.pie_chart.hint ?? ""}
                          onChange={(e) =>
                            onChange(
                              patchPlan(plan, {
                                pie_chart: { ...plan.pie_chart, hint: e.target.value },
                              })
                            )
                          }
                          placeholder="مثلاً: وضعیت درخواست‌ها (باز · در بررسی · بسته)"
                        />
                      </WizardField>
                    </div>
                  )}
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>

        <WidgetLayoutPreview plan={plan} hideReviewSection className="h-fit lg:sticky lg:top-4" />
      </div>
    </div>
  );
}
