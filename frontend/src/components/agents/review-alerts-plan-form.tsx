"use client";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { WizardField } from "@/components/agents/wizard-field";
import {
  parseReviewAlertRules,
  patchReviewTable,
  type AgentWidgetPlan,
  type ReviewAlertRule,
} from "@/lib/widget-plan";

type Props = {
  value: AgentWidgetPlan;
  onChange: (plan: AgentWidgetPlan) => void;
};

function emptyRule(): ReviewAlertRule {
  return { description: "", threshold: "" };
}

export function ReviewAlertsPlanForm({ value, onChange }: Props) {
  const review = value.review_table;
  const rules = parseReviewAlertRules(review);

  function patchReview(patch: Parameters<typeof patchReviewTable>[1]) {
    onChange({
      ...value,
      review_table: patchReviewTable(review, patch),
    });
  }

  function setRules(next: ReviewAlertRule[]) {
    patchReview({ alert_rules: next.length ? next : [emptyRule()] });
  }

  function updateRule(index: number, patch: Partial<ReviewAlertRule>) {
    const next = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setRules(next);
  }

  function addRule() {
    setRules([...rules, emptyRule()]);
  }

  function removeRule(index: number) {
    if (rules.length <= 1) {
      setRules([emptyRule()]);
      return;
    }
    setRules(rules.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-accent-amber/25 bg-accent-amber/5 px-4 py-3">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent-amber" />
          <div className="space-y-1 text-sm leading-relaxed text-stone-700">
            <p className="font-semibold text-stone-900">جدول بازبینی و هشدار</p>
            <p>
              اینجا مشخص می‌کنید چه خروجی‌هایی از ایجنت باید توسط انسان بررسی شود و از چه حدی به
              بعد هشدار داده شود. هر ردیف یک قانون جداگانه است و در پنل ایجنت به‌صورت جدول
              «موارد نیازمند بررسی» نمایش داده می‌شود.
            </p>
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-stone-800">فعال‌سازی جدول بازبینی</p>
          <p className="text-xs text-stone-500">
            بدون فعال‌سازی، این بخش در داشبورد ایجنت نمایش داده نمی‌شود — در پایین پنل، زیر
            نمودارها
          </p>
        </div>
        <input
          type="checkbox"
          checked={review.enabled}
          onChange={(e) =>
            patchReview({
              enabled: e.target.checked,
              title: review.title || "موارد نیازمند بررسی",
              alert_rules: rules.length ? rules : [emptyRule()],
            })
          }
          className="h-4 w-4 accent-brand-600"
        />
      </label>

      {review.enabled && (
        <Stagger initial={false} className="space-y-4">
          <StaggerItem variant="slideUp">
            <WizardField
              label="عنوان جدول در پنل"
              hint="عنوانی که بالای جدول بازبینی در داشبورد ایجنت دیده می‌شود"
            >
              <Input
                value={review.title ?? ""}
                onChange={(e) => patchReview({ title: e.target.value })}
                placeholder="مثلاً: موارد نیازمند تأیید مالی"
              />
            </WizardField>
          </StaggerItem>

          <StaggerItem variant="slideUp">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-stone-800">قوانین هشدار</p>
                <p className="text-xs text-stone-500">
                  برای هر مورد: شرح کنید چه چیزی بررسی شود و حد آستانه هشدار چیست
                </p>
              </div>
              <Button type="button" variant="secondary" className="h-8 gap-1 text-xs" onClick={addRule}>
                <Plus className="h-3.5 w-3.5" />
                قانون جدید
              </Button>
            </div>
          </StaggerItem>

          {rules.map((rule, index) => (
            <StaggerItem key={index} variant="slideUp">
              <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-500">قانون {index + 1}</span>
                  <button
                    type="button"
                    className="rounded-lg p-1 text-stone-400 hover:bg-stone-200 hover:text-accent-red"
                    onClick={() => removeRule(index)}
                    aria-label="حذف قانون"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <WizardField
                    label="شرح مورد"
                    hint="چه خروجی یا وضعیتی باید در جدول بازبینی بیاید؟"
                  >
                    <Textarea
                      value={rule.description}
                      onChange={(e) => updateRule(index, { description: e.target.value })}
                      rows={2}
                      placeholder="مثلاً: فاکتور با مبلغ غیرعادی"
                    />
                  </WizardField>
                  <WizardField
                    label="حد هشدار / آستانه"
                    hint="از چه مقداری به بالا هشدار صادر شود؟ (عدد، درصد، شرط)"
                  >
                    <Input
                      value={rule.threshold}
                      onChange={(e) => updateRule(index, { threshold: e.target.value })}
                      placeholder="مثلاً: بالای ۱۰ میلیون ریال"
                    />
                  </WizardField>
                </div>
              </div>
            </StaggerItem>
          ))}

          <StaggerItem variant="fadeIn">
            <p className="rounded-lg border border-dashed border-stone-200 bg-white px-3 py-2 text-xs text-stone-500">
              نمونه: «اضافه‌کار بیش از حد» — آستانه «بیش از ۱۲ ساعت در ماه» · «مغایرت بانکی» —
              آستانه «هر تراکنش بدون تطبیق»
            </p>
          </StaggerItem>
        </Stagger>
      )}
    </div>
  );
}
