"use client";

import { Plus, Trash2 } from "lucide-react";
import { ActionInputsEditor } from "@/components/agents/action-inputs-editor";
import { WizardField } from "@/components/agents/wizard-field";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { splitUserPrompt } from "@/lib/action-inputs";
import type { AgentAction } from "@/types";

type Props = {
  actions: AgentAction[];
  onChange: (actions: AgentAction[]) => void;
};

function emptyAction(i: number): AgentAction {
  return {
    slug: `action_${i + 1}`,
    label: "",
    description: "",
    prompt_template: "",
    input_schema: {},
    tool_chain: [],
    confirmation_required: false,
    order_index: i,
  };
}

export function ActionRepeater({ actions, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-stone-800">دکمه‌های آماده برای کاربر</p>
          <Button
            type="button"
            variant="secondary"
            className="!px-3 !py-1.5 text-xs"
            onClick={() => onChange([...actions, emptyAction(actions.length)])}
          >
            <Plus className="h-4 w-4" />
            افزودن دکمه
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-stone-500">
          هر دکمه یک کار مشخص است که کاربر با یک کلیک انجام می‌دهد — مثل «اجرای حقوق ماه» یا
          «صدور گزارش».
        </p>
      </div>
      {actions.length === 0 && (
        <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-4 text-center text-sm text-stone-500">
          هنوز دکمه‌ای تعریف نشده. اگر فقط گفت‌وگو کافی است، می‌توانید این بخش را خالی بگذارید.
        </p>
      )}
      <Stagger initial={false} className="space-y-3">
        {actions.map((act, idx) => (
          <StaggerItem key={idx} variant="slideRight">
            <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex justify-between gap-2">
                <p className="text-xs font-semibold text-brand-700">دکمه {idx + 1}</p>
                <button
                  type="button"
                  onClick={() => onChange(actions.filter((_, i) => i !== idx))}
                  className="text-stone-400 hover:text-accent-red"
                  aria-label="حذف دکمه"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <WizardField
                label="عنوان روی دکمه"
                hint="متنی که کاربر روی دکمه می‌بیند — فارسی و کوتاه."
              >
                <Input
                  placeholder="مثلاً صدور فیش حقوقی"
                  value={act.label}
                  onChange={(e) => {
                    const next = [...actions];
                    next[idx] = { ...act, label: e.target.value };
                    onChange(next);
                  }}
                />
              </WizardField>
              <WizardField
                label="این دکمه چه کاری انجام دهد؟"
                hint="به زبان ساده بنویسید. اگر پایین «ورودی از کاربر» تعریف کنید، خودکار در اجرا استفاده می‌شود."
              >
                <Textarea
                  placeholder="فیش حقوقی دوره مشخص‌شده را بساز و لینک دانلود بده."
                  rows={3}
                  value={splitUserPrompt(act.prompt_template)}
                  onChange={(e) => {
                    const next = [...actions];
                    next[idx] = { ...act, prompt_template: e.target.value };
                    onChange(next);
                  }}
                />
              </WizardField>
              <ActionInputsEditor
                schema={act.input_schema}
                onChange={(schema) => {
                  const next = [...actions];
                  next[idx] = { ...act, input_schema: schema };
                  onChange(next);
                }}
              />
              <label className="flex items-center gap-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={act.confirmation_required}
                  onChange={(e) => {
                    const next = [...actions];
                    next[idx] = { ...act, confirmation_required: e.target.checked };
                    onChange(next);
                  }}
                  className="accent-brand-600"
                />
                قبل از اجرا از کاربر تأیید بگیر
              </label>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
