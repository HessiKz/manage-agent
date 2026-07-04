"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  steps: readonly string[];
  currentIndex: number;
  stepComplete: boolean[];
  onStepClick?: (index: number) => void;
};

export function WizardProcessStepper({
  steps,
  currentIndex,
  stepComplete,
  onStepClick,
}: Props) {
  return (
    <nav aria-label="مراحل ساخت ایجنت" className="w-full" data-ma-guide="wizard-steps">
      <ol className="flex flex-wrap items-start gap-y-3">
        {steps.map((label, i) => {
          const done = Boolean(stepComplete[i]);
          const current = i === currentIndex;
          const last = i === steps.length - 1;

          return (
            <li key={label} className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                data-ma-support={`wizard-step-tab-${i}`}
                aria-current={current ? "step" : undefined}
                onClick={() => onStepClick?.(i)}
                className={cn(
                  "group flex min-w-0 flex-col items-center gap-1.5 text-center transition-colors",
                  onStepClick ? "cursor-pointer" : "cursor-default"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : current
                        ? "border-brand-600 bg-brand-600 text-white shadow-glow"
                        : "border-stone-200 bg-white text-stone-400 group-hover:border-stone-300"
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "max-w-[7rem] text-[11px] leading-tight sm:max-w-none sm:text-xs",
                    current ? "font-bold text-brand-800" : done ? "font-medium text-stone-700" : "text-stone-400"
                  )}
                >
                  {label}
                </span>
              </button>
              {!last && (
                <span
                  className={cn(
                    "mx-1 mt-4 hidden h-0.5 min-w-[12px] flex-1 sm:block",
                    done ? "bg-emerald-400" : "bg-stone-200"
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
