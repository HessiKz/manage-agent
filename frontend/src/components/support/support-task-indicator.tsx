"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Bot, MousePointer2 } from "lucide-react";
import type { SupportPlayProgress } from "@/lib/support-ui-script";
import { LoadingSpinner } from "@/components/loading";
import { cn } from "@/lib/utils";

type Props = {
  active: boolean;
  label: string;
  progress?: SupportPlayProgress | null;
  onStop: () => void;
  className?: string;
};

export function SupportTaskIndicator({
  active,
  label,
  progress,
  onStop,
  className,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !rootRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    gsap.fromTo(
      rootRef.current,
      { opacity: 0, y: 14, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "power2.out" }
    );
  }, [active]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !progress) return;
    const pct = Math.min(100, Math.round((progress.step / progress.total) * 100));
    gsap.to(bar, { width: `${pct}%`, duration: 0.35, ease: "power2.out" });
  }, [progress]);

  if (!active) return null;

  const stepLabel = progress
    ? `مرحله ${progress.step} از ${progress.total}`
    : "در حال اجرا…";

  return (
    <div
      ref={rootRef}
      className={cn(
        "mb-2 overflow-hidden rounded-xl border border-brand-200/80 bg-gradient-to-l from-brand-50 to-white shadow-sm",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="h-0.5 w-full bg-brand-100">
        <div ref={barRef} className="h-full w-0 bg-brand-500" />
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-xs font-bold text-stone-900">ایجنت پشتیبان در حال کار</p>
          <p className="truncate text-[11px] text-stone-600">{label || stepLabel}</p>
          {progress?.label ? (
            <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-brand-700">
              <MousePointer2 className="h-3 w-3" />
              {progress.label}
            </p>
          ) : null}
        </div>
        <LoadingSpinner />
        <button
          type="button"
          className="shrink-0 rounded-lg border border-accent-red/30 bg-accent-red/10 px-2 py-1 text-[11px] font-semibold text-accent-red hover:bg-accent-red/15"
          onClick={onStop}
        >
          توقف
        </button>
      </div>
    </div>
  );
}
