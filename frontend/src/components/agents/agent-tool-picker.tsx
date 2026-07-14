"use client";

import { useMemo } from "react";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import {
  categoryLabel,
  friendlyTool,
  groupToolsByCategory,
} from "@/lib/agent-tool-labels";
import { cn } from "@/lib/utils";
import type { ToolInfo } from "@/types";

type Props = {
  tools: ToolInfo[];
  selected: string[];
  onChange: (slugs: string[]) => void;
  compact?: boolean;
  /** Wizard: only show common business tools (hide budget/crm/etc). */
  wizardOnly?: boolean;
};

/** Slugs shown in the agent creation wizard (hide obscure/internal tools). */
export const WIZARD_TOOL_SLUGS = new Set([
  "hr_lookup",
  "run_agent_script",
  "report_generate",
  "resume_screen",
]);

export function AgentToolPicker({
  tools,
  selected,
  onChange,
  compact = false,
  wizardOnly = false,
}: Props) {
  const visibleTools = useMemo(() => {
    if (!wizardOnly) return tools;
    return tools.filter((t) => WIZARD_TOOL_SLUGS.has(t.slug));
  }, [tools, wizardOnly]);
  const grouped = useMemo(() => groupToolsByCategory(visibleTools), [visibleTools]);

  function toggle(slug: string) {
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else {
      onChange([...selected, slug]);
    }
  }

  if (visibleTools.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-6 text-center text-sm text-stone-500">
        هنوز ابزار آماده‌ای در سیستم ثبت نشده. می‌توانید بدون ابزار هم ایجنت را بسازید.
      </p>
    );
  }

  return (
    <Stagger initial={false} className="space-y-4">
      {!compact && (
        <StaggerItem variant="fadeIn">
          <p className="text-xs leading-relaxed text-stone-500">
            هر مورد یک «کار آماده» برای ایجنت است — مثل خواندن پرسنل یا ساخت گزارش. نیازی به
            کدنویسی نیست؛ فقط بگویید ایجنت در چه موقعیتی از آن استفاده کند.
          </p>
        </StaggerItem>
      )}
      {Array.from(grouped.entries()).map(([category, items]) => (
        <StaggerItem key={category} variant="slideUp">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
              {categoryLabel(category)}
            </p>
            <div className="space-y-2">
              {items.map((item) => {
                const on = selected.includes(item.slug);
                return (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => toggle(item.slug)}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-right transition-colors duration-150",
                      on
                        ? "border-brand-500 bg-brand-50/70 shadow-sm"
                        : "border-stone-200 bg-white hover:border-brand-200 hover:bg-brand-50/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-stone-900">{item.title}</p>
                        <p className="mt-1 text-sm text-stone-600">{item.summary}</p>
                        {!compact && (
                          <p className="mt-2 text-xs text-stone-400">{item.whenToUse}</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold",
                          on
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-stone-300 bg-white text-transparent"
                        )}
                        aria-hidden
                      >
                        ✓
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </StaggerItem>
      ))}
      {selected.length > 0 && (
        <StaggerItem variant="fadeIn">
          <p className="text-xs text-brand-700">
            {selected.length} ابزار فعال — ایجنت می‌تواند در پاسخ‌ها و اقدامات از آن‌ها استفاده کند.
          </p>
        </StaggerItem>
      )}
    </Stagger>
  );
}

/** Compact chips for action tool chain (same friendly labels). */
export function ActionToolChips({
  tools,
  selected,
  onToggle,
}: {
  tools: ToolInfo[];
  selected: string[];
  onToggle: (slug: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tools.map((t) => {
        const f = friendlyTool(t);
        const on = selected.includes(t.slug);
        return (
          <button
            key={t.slug}
            type="button"
            onClick={() => onToggle(t.slug)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              on ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-brand-100"
            )}
            title={f.whenToUse}
          >
            {f.title}
          </button>
        );
      })}
    </div>
  );
}
