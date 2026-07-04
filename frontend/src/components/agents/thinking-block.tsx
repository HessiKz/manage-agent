"use client";

import { GsapLoadingOrb } from "@/components/loading/gsap-loading-orb";
import { LlmProcessIndicator } from "@/components/loading/llm-process-indicator";
import type { LlmLoadingPhase } from "@/lib/llm-loading-state";
import { cn } from "@/lib/utils";

type ThinkingBlockProps = {
  content: string;
  active?: boolean;
  className?: string;
  phase?: LlmLoadingPhase;
  statusMessage?: string;
  thinkingSummary?: string;
};

/** Expandable thinking trace for completed turns. */
export function ThinkingBlock({
  content,
  active = false,
  className,
  phase = "thinking",
  statusMessage,
  thinkingSummary,
}: ThinkingBlockProps) {
  return (
    <LlmProcessIndicator
      phase={active ? phase : "done"}
      statusMessage={statusMessage ?? (active ? "در حال تفکر…" : "فرآیند تفکر")}
      thinkingContent={content}
      thinkingActive={active}
      thinkingSummary={thinkingSummary}
      thinkingOpen={active}
      variant="bubble"
      className={className}
    />
  );
}

/** Large centered pulse for wizard / validation screens. */
export function ThinkingPulse({ reduced }: { reduced: boolean }) {
  if (reduced) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100">
        <GsapLoadingOrb size="md" tone="neutral" />
      </div>
    );
  }

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <GsapLoadingOrb size="lg" tone="brand" className="scale-110" />
    </div>
  );
}

export { LlmProcessIndicator } from "@/components/loading/llm-process-indicator";
