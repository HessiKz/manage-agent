"use client";

import { cn } from "@/lib/utils";
import {
  PRECISION_HELPERS,
  PRECISION_LABELS,
  PRECISION_ORDER,
} from "@/lib/agent-presets";
import type { ExecutionPrecision } from "@/types";

type Props = {
  value: ExecutionPrecision;
  onChange: (precision: ExecutionPrecision) => void;
};

export function PrecisionPicker({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="دقت اجرا"
      className="flex flex-wrap gap-2 rounded-2xl border border-stone-200 bg-white p-2"
    >
      {PRECISION_ORDER.map((p) => {
        const selected = value === p;
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={selected}
            data-ma-support={`wizard-precision-${p}`}
            onClick={() => onChange(p)}
            className={cn(
              "group flex min-w-[7.5rem] flex-1 flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-right transition-colors duration-150",
              selected
                ? "bg-brand-600 text-white shadow-sm"
                : "text-stone-600 hover:bg-brand-50/60 hover:text-brand-700"
            )}
          >
            <span className="text-sm font-semibold leading-tight">
              {PRECISION_LABELS[p]}
            </span>
            <span
              className={cn(
                "mt-0.5 hidden text-[11px] leading-tight sm:block",
                selected ? "text-brand-100" : "text-stone-400"
              )}
            >
              {PRECISION_HELPERS[p]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
