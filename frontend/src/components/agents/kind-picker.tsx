"use client";

import { Bot, GitBranch, MessageSquare, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_KINDS, KIND_LABELS, KIND_PRESETS } from "@/lib/agent-presets";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
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
    <Stagger initial={false} className="grid gap-3 sm:grid-cols-2">
      {AGENT_KINDS.map((kind) => {
        const { icon: Icon, desc } = KIND_META[kind];
        return (
          <StaggerItem key={kind} variant="scaleIn">
            <button
              type="button"
              data-ma-support={`wizard-kind-${kind}`}
              onClick={() => onChange(kind, { ...KIND_PRESETS[kind] })}
              className={cn(
                "w-full rounded-2xl border p-4 text-right transition-colors duration-150",
                value === kind
                  ? "border-brand-500 bg-brand-50/60 shadow-sm"
                  : "border-stone-200 bg-white hover:border-brand-300 hover:bg-brand-50/30"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    value === kind ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-700"
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-stone-900">{KIND_LABELS[kind]}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{desc}</p>
                </div>
              </div>
            </button>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
