"use client";

import { Sparkles, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SkillSuggestionProps = {
  slug: string;
  confidence: number;
  reasons: string[];
  onAccept: (slug: string) => void;
  onDismiss: (slug: string) => void;
  className?: string;
};

/** Presentational chip shown when matchAndRunSkill returns a "suggest" (do NOT auto-run) result. */
export function SkillSuggestion({
  slug,
  confidence,
  reasons,
  onAccept,
  onDismiss,
  className,
}: SkillSuggestionProps) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return (
    <div
      className={cn(
        "rounded-2xl border border-brand-200 bg-brand-50/70 p-3 text-sm shadow-sm",
        className
      )}
      role="status"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-600" />
          <p className="font-semibold text-stone-900">پیشنهاد مهارت</p>
        </div>
        <button
          type="button"
          aria-label="رد کردن"
          onClick={() => onDismiss(slug)}
          className="rounded-full p-1 text-stone-400 transition hover:bg-white hover:text-stone-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p dir="ltr" className="mt-1 text-xs text-stone-600">
        {slug} · {pct}٪
      </p>

      {reasons.length > 0 && (
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-stone-600">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <Button
          className="px-3 py-1.5 text-xs"
          onClick={() => onAccept(slug)}
        >
          <Check className="h-3.5 w-3.5" />
          اجرای مهارت
        </Button>
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => onDismiss(slug)}
        >
          رد کردن
        </Button>
      </div>
    </div>
  );
}
