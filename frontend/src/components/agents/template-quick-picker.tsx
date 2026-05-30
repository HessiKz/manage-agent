"use client";

import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { AgentPromptTemplate } from "@/types";

type Props = {
  templates: AgentPromptTemplate[];
  onSelect: (body: string) => void;
};

export function TemplateQuickPicker({ templates, onSelect }: Props) {
  if (!templates.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-stone-500">قالب‌های سریع</p>
      <Stagger initial={false} className="flex flex-wrap gap-2">
        {templates.map((tpl) => (
          <StaggerItem key={tpl.slug} variant="fadeIn">
            <button
              type="button"
              onClick={() => onSelect(tpl.body)}
              className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 transition-colors duration-150 hover:bg-brand-100"
            >
              {tpl.label || tpl.slug}
            </button>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
