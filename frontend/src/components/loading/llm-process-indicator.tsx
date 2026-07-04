"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Brain, ChevronDown } from "lucide-react";
import { GsapLoadingOrb } from "@/components/loading/gsap-loading-orb";
import {
  LLM_PHASE_LABELS,
  LLM_PHASE_ORDER,
  thinkingPreview,
  type LlmLoadingPhase,
} from "@/lib/llm-loading-state";
import { cn } from "@/lib/utils";

type Props = {
  phase: LlmLoadingPhase;
  statusMessage: string;
  thinkingContent?: string;
  thinkingActive?: boolean;
  thinkingSummary?: string;
  /** Controlled expand for thinking panel */
  thinkingOpen?: boolean;
  onThinkingOpenChange?: (open: boolean) => void;
  variant?: "bubble" | "panel" | "compact";
  className?: string;
};

export function LlmProcessIndicator({
  phase,
  statusMessage,
  thinkingContent = "",
  thinkingActive = false,
  thinkingSummary,
  thinkingOpen,
  onThinkingOpenChange,
  variant = "bubble",
  className,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const canShowThinking = thinkingContent.trim().length > 0 || thinkingActive;
  const summary = thinkingSummary ?? statusMessage;
  const open = thinkingOpen ?? thinkingActive;

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || phase === "idle" || phase === "done") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const idx = Math.max(0, LLM_PHASE_ORDER.indexOf(phase));
    const pct = ((idx + 1) / LLM_PHASE_ORDER.length) * 100;
    gsap.to(bar, { width: `${pct}%`, duration: 0.35, ease: "power2.out" });
  }, [phase]);

  if (phase === "idle") return null;

  const phaseSteps = (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {LLM_PHASE_ORDER.map((p) => {
        const active = p === phase;
        const done = LLM_PHASE_ORDER.indexOf(p) < LLM_PHASE_ORDER.indexOf(phase);
        if (phase === "generating" && p === "tools" && !done) {
          /* tools may be skipped */
        }
        return (
          <span
            key={p}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
              active && "bg-brand-600 text-white",
              done && "bg-brand-100 text-brand-800",
              !active && !done && "bg-stone-100 text-stone-400"
            )}
          >
            {LLM_PHASE_LABELS[p]}
          </span>
        );
      })}
    </div>
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-stone-200/80 bg-stone-50/95",
        variant === "compact" && "rounded-lg",
        variant === "panel" && "p-4",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy={phase !== "done"}
    >
      <div className="h-0.5 w-full bg-stone-200/80">
        <div ref={barRef} className="h-full w-0 bg-brand-500" />
      </div>

      <div className={cn("flex items-start gap-3 p-3", variant === "panel" && "p-0 pt-3")}>
        <GsapLoadingOrb size={variant === "compact" ? "sm" : "md"} tone="neutral" />
        <div className="min-w-0 flex-1 text-right">
          {variant !== "compact" ? phaseSteps : null}
          <p className="text-sm font-medium text-stone-800">{statusMessage || LLM_PHASE_LABELS[phase]}</p>
          {summary && summary !== statusMessage ? (
            <p className="mt-1 text-xs leading-relaxed text-stone-500">{summary}</p>
          ) : null}

          {canShowThinking ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => onThinkingOpenChange?.(!open)}
                className="flex w-full items-center gap-2 rounded-lg border border-stone-200/80 bg-white/80 px-2.5 py-1.5 text-xs text-stone-600 transition-colors hover:bg-white"
                aria-expanded={open}
              >
                <Brain className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                <span className="font-medium">
                  {thinkingActive ? "در حال تفکر" : "مشاهده فرآیند تفکر"}
                </span>
                <ChevronDown
                  className={cn(
                    "mr-auto h-3.5 w-3.5 transition-transform",
                    open && "rotate-180"
                  )}
                />
              </button>
              {open ? (
                <pre className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-stone-200/70 bg-stone-900/5 p-2.5 font-mono text-[11px] leading-relaxed text-stone-600">
                  {thinkingContent.trim() || (thinkingActive ? "…" : "")}
                </pre>
              ) : (
                thinkingContent.trim() ? (
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-stone-500">
                    {thinkingPreview(thinkingContent)}
                  </p>
                ) : null
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
