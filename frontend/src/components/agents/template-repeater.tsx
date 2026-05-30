"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { AgentPromptTemplate } from "@/types";

type Props = {
  templates: AgentPromptTemplate[];
  onChange: (templates: AgentPromptTemplate[]) => void;
};

function emptyTemplate(i: number): AgentPromptTemplate {
  return {
    slug: `tpl_${i + 1}`,
    label: "",
    body: "",
    variables: {},
    order_index: i,
  };
}

export function TemplateRepeater({ templates, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-stone-800">میانبرهای آماده گفت‌وگو</p>
          <Button
            type="button"
            variant="secondary"
            className="!px-3 !py-1.5 text-xs"
            onClick={() => onChange([...templates, emptyTemplate(templates.length)])}
          >
            <Plus className="h-4 w-4" />
            افزودن
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-stone-500">
          جمله‌های ازپیش‌نوشته که کاربر با یک کلیک در گفت‌وگو می‌فرستد — مثل «حقوق این ماه را اجرا کن».
        </p>
      </div>
      <Stagger initial={false} className="space-y-3">
        {templates.map((tpl, idx) => (
          <StaggerItem key={idx} variant="slideRight">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
              <div className="flex justify-between">
                <p className="text-xs font-semibold text-stone-500">قالب {idx + 1}</p>
                <button
                  type="button"
                  onClick={() => onChange(templates.filter((_, i) => i !== idx))}
                  className="text-stone-400 hover:text-accent-red"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Input
                placeholder="عنوان میانبر (مثلاً حقوق ماهانه)"
                value={tpl.label}
                onChange={(e) => {
                  const next = [...templates];
                  next[idx] = { ...tpl, label: e.target.value };
                  onChange(next);
                }}
              />
              <Textarea
                placeholder="متن پیامی که برای ایجنت ارسال می‌شود — مثلاً: حقوق این ماه را آماده کن"
                rows={3}
                value={tpl.body}
                onChange={(e) => {
                  const next = [...templates];
                  next[idx] = { ...tpl, body: e.target.value };
                  onChange(next);
                }}
              />
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
