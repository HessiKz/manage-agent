"use client";

import { Bot, GitBranch, MessageSquare, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_KINDS, KIND_LABELS, KIND_PRESETS } from "@/lib/agent-presets";
import type { AgentCapabilities, AgentKind } from "@/types";

const KIND_META: Record<
  AgentKind,
  { icon: typeof Bot; desc: string }
> = {
  chat: { icon: MessageSquare, desc: "گفت‌وگوی آزاد با کاربر" },
  worker: { icon: Bot, desc: "دکمه‌های عملیاتی و قالب‌های آماده" },
  supervisor: { icon: GitBranch, desc: "مسیریابی به زیرایجنت‌ها" },
  custom: { icon: Sliders, desc: "ترکیب دلخواه توانایی‌ها" },
};

type Props = {
  value: AgentKind;
  onChange: (kind: AgentKind, caps: AgentCapabilities) => void;
};

export function KindPicker({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="نوع ایجنت"
      className="flex flex-wrap gap-2 rounded-2xl border border-stone-200 bg-white p-2"
    >
      {AGENT_KINDS.map((kind) => {
        const { icon: Icon, desc } = KIND_META[kind];
        const selected = value === kind;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={selected}
            data-ma-support={`wizard-kind-${kind}`}
            onClick={() => onChange(kind, { ...KIND_PRESETS[kind] })}
            className={cn(
              "group flex min-w-[7.5rem] flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-right transition-colors duration-150",
              selected
                ? "bg-brand-600 text-white shadow-sm"
                : "text-stone-600 hover:bg-brand-50/60 hover:text-brand-700"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{KIND_LABELS[kind]}</p>
              <p
                className={cn(
                  "mt-0.5 hidden text-[11px] leading-tight sm:block",
                  selected ? "text-brand-100" : "text-stone-400"
                )}
              >
                {desc}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
