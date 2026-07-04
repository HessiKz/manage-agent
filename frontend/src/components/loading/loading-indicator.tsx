"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { GsapLoadingOrb } from "@/components/loading/gsap-loading-orb";
import { cn } from "@/lib/utils";

type Size = "inline" | "sm" | "md" | "lg" | "panel";

type Props = {
  /** Primary status line shown beside the orb */
  stage?: string;
  /** Optional secondary detail (e.g. thinking summary) */
  detail?: string;
  size?: Size;
  tone?: "brand" | "neutral" | "inverse";
  className?: string;
  /** For multi-step operations: highlight current stage id */
  activeStageId?: string;
  stages?: { id: string; label: string }[];
};

const ORB_SIZE: Record<Size, "xs" | "sm" | "md" | "lg"> = {
  inline: "xs",
  sm: "sm",
  md: "md",
  lg: "lg",
  panel: "lg",
};

export function LoadingIndicator({
  stage,
  detail,
  size = "md",
  tone = "brand",
  className,
  activeStageId,
  stages,
}: Props) {
  const labelRef = useRef<HTMLParagraphElement>(null);
  const [displayStage, setDisplayStage] = useState(stage ?? "در حال بارگذاری…");

  useEffect(() => {
    if (!stage) return;
    const el = labelRef.current;
    if (!el) {
      setDisplayStage(stage);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplayStage(stage);
      return;
    }
    gsap.to(el, {
      opacity: 0,
      y: 4,
      duration: 0.12,
      onComplete: () => {
        setDisplayStage(stage);
        gsap.fromTo(el, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.18 });
      },
    });
  }, [stage]);

  const isPanel = size === "panel";

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        isPanel && "flex-col items-center py-8 text-center",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <GsapLoadingOrb size={ORB_SIZE[size]} tone={tone} />
      <div className={cn("min-w-0 flex-1", isPanel && "w-full max-w-md")}>
        <p
          ref={labelRef}
          className={cn(
            "font-medium text-stone-800",
            size === "inline" && "text-xs",
            size === "sm" && "text-sm",
            (size === "md" || size === "panel") && "text-sm",
            size === "lg" && "text-base"
          )}
        >
          {displayStage}
        </p>
        {detail ? (
          <p className="mt-1 text-xs leading-relaxed text-stone-500">{detail}</p>
        ) : null}
        {stages && stages.length > 1 ? (
          <ol className="mt-3 space-y-1.5 text-right">
            {stages.map((s) => {
              const active = s.id === activeStageId;
              const done =
                activeStageId &&
                stages.findIndex((x) => x.id === activeStageId) >
                  stages.findIndex((x) => x.id === s.id);
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2 text-xs transition-colors",
                    active && "font-medium text-brand-800",
                    done && "text-stone-500",
                    !active && !done && "text-stone-400"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      active && "bg-brand-500",
                      done && "bg-brand-300",
                      !active && !done && "bg-stone-300"
                    )}
                  />
                  {s.label}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/** Compact inline replacement for Loader2 spinners in buttons. */
export function LoadingSpinner({
  className,
  tone = "brand",
}: {
  className?: string;
  tone?: "brand" | "neutral" | "inverse";
}) {
  return <GsapLoadingOrb size="xs" tone={tone} className={className} />;
}
