"use client";

import { Lock } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import {
  clampCapabilitiesForKind,
  getCapabilityRule,
  type CapabilityKey,
} from "@/lib/capability-rules";
import type { AgentCapabilities, AgentKind } from "@/types";

const TOGGLES: {
  key: CapabilityKey;
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
    hint: "میانبرهای آماده گفت‌وگو — پس از فعال‌سازی، قالب‌ها را همین پایین تعریف کنید.",
  },
  {
    key: "can_call_agents",
    label: "فراخوانی ایجنت‌ها",
    hint: "توانایی — ایجنت دیگر به‌عنوان ابزار",
  },
  {
    key: "supervisor_enabled",
    label: "مسیریابی زیرایجنت",
    hint: "توانایی — فقط برای نوع «سرپرست»",
  },
  {
    key: "external_apis_enabled",
    label: "APIهای خارجی",
    hint: "توانایی — اتصال endpoint یکپارچه‌سازی",
  },
];

type Props = {
  kind: AgentKind;
  value: AgentCapabilities;
  onChange: (caps: AgentCapabilities) => void;
};

export function CapabilityToggles({ kind, value, onChange }: Props) {
  function toggle(key: CapabilityKey, checked: boolean) {
    const next = clampCapabilitiesForKind(kind, { ...value, [key]: checked });
    onChange(next);
  }

  return (
    <Stagger initial={false} className="space-y-2">
      {TOGGLES.map(({ key, label, hint }) => {
        const rule = getCapabilityRule(kind, key);
        const locked = rule.locked;
        const checked = locked && rule.forcedValue !== undefined ? rule.forcedValue : Boolean(value[key]);

        return (
          <StaggerItem key={key} variant="slideRight">
            <label
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                locked
                  ? "cursor-not-allowed border-stone-200/80 bg-stone-50/80"
                  : "cursor-pointer border-stone-200 bg-white"
              }`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
                  {label}
                  {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />}
                </p>
                <p className="text-xs text-stone-500">
                  {locked && rule.lockReason ? rule.lockReason : hint}
                </p>
              </div>
              <input
                type="checkbox"
                checked={checked}
                disabled={locked}
                onChange={(e) => toggle(key, e.target.checked)}
                className="h-4 w-4 shrink-0 accent-brand-600 disabled:opacity-50"
              />
            </label>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
