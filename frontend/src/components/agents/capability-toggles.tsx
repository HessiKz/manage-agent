"use client";

import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { AgentCapabilities } from "@/types";

const TOGGLES: {
  key: keyof AgentCapabilities;
  label: string;
  hint: string;
}[] = [
  { key: "chat_enabled", label: "گفت‌وگو", hint: "توانایی — گفت‌وگوی آزاد با کاربر" },
  {
    key: "file_upload_enabled",
    label: "آپلود فایل",
    hint: "توانایی — دریافت PDF، CSV، اکسل و …",
  },
  {
    key: "actions_enabled",
    label: "دکمه‌های عملیاتی",
    hint: "توانایی — اقدامات از پیش تعریف‌شده",
  },
  {
    key: "templates_enabled",
    label: "قالب‌های پرامپت",
    hint: "توانایی — انتخاب سریع دستور آماده",
  },
  {
    key: "can_call_agents",
    label: "فراخوانی ایجنت‌ها",
    hint: "توانایی — ایجنت دیگر به‌عنوان ابزار",
  },
  {
    key: "supervisor_enabled",
    label: "مسیریابی زیرایجنت",
    hint: "توانایی — فقط برای نوع «سرپرست» یا سفارشی",
  },
  {
    key: "external_apis_enabled",
    label: "APIهای خارجی",
    hint: "توانایی — اتصال endpoint یکپارچه‌سازی",
  },
];

type Props = {
  value: AgentCapabilities;
  onChange: (caps: AgentCapabilities) => void;
};

export function CapabilityToggles({ value, onChange }: Props) {
  return (
    <Stagger initial={false} className="space-y-2">
      {TOGGLES.map(({ key, label, hint }) => (
        <StaggerItem key={key} variant="slideRight">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-stone-800">{label}</p>
              <p className="text-xs text-stone-500">{hint}</p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(value[key])}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
              className="h-4 w-4 accent-brand-600"
            />
          </label>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
