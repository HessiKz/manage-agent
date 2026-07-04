"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

const SIZE_MAP: Record<Size, { box: string; ring: string; core: string }> = {
  xs: { box: "h-4 w-4", ring: "inset-0", core: "inset-[30%]" },
  sm: { box: "h-6 w-6", ring: "inset-0", core: "inset-[28%]" },
  md: { box: "h-10 w-10", ring: "inset-0", core: "inset-[26%]" },
  lg: { box: "h-16 w-16", ring: "inset-0", core: "inset-[24%]" },
};

type Props = {
  size?: Size;
  className?: string;
  /** brand = teal gradient, neutral = stone, inverse = on dark surfaces */
  tone?: "brand" | "neutral" | "inverse";
};

export function GsapLoadingOrb({
  size = "md",
  className,
  tone = "brand",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dims = SIZE_MAP[size];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ring = root.querySelector<HTMLElement>("[data-orb-ring]");
    const core = root.querySelector<HTMLElement>("[data-orb-core]");
    const arc = root.querySelector<HTMLElement>("[data-orb-arc]");
    if (!ring || !core || !arc) return;

    if (reduced) {
      gsap.set([ring, core, arc], { clearProps: "all" });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.to(ring, {
        rotation: 360,
        duration: 2.4,
        ease: "none",
        repeat: -1,
        transformOrigin: "50% 50%",
      });
      gsap.to(arc, {
        rotation: -360,
        duration: 1.6,
        ease: "power1.inOut",
        repeat: -1,
        transformOrigin: "50% 50%",
      });
      gsap.to(core, {
        scale: 1.08,
        duration: 1.1,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        transformOrigin: "50% 50%",
      });
    }, root);

    return () => ctx.revert();
  }, []);

  const ringClass =
    tone === "inverse"
      ? "border-white/30"
      : tone === "neutral"
        ? "border-stone-300/70"
        : "border-brand-400/50";
  const coreClass =
    tone === "inverse"
      ? "bg-white text-brand-700"
      : tone === "neutral"
        ? "bg-stone-700 text-white"
        : "bg-gradient-to-br from-brand-500 to-brand-700 text-white";
  const arcClass =
    tone === "inverse" ? "border-t-white" : tone === "neutral" ? "border-t-stone-600" : "border-t-brand-600";

  return (
    <div
      ref={rootRef}
      className={cn("relative shrink-0", dims.box, className)}
      role="status"
      aria-hidden
    >
      <span
        data-orb-ring
        className={cn("absolute rounded-full border-2 border-dashed", dims.ring, ringClass)}
      />
      <span
        data-orb-arc
        className={cn(
          "absolute rounded-full border-2 border-transparent",
          dims.ring,
          arcClass
        )}
      />
      <span
        data-orb-core
        className={cn("absolute rounded-full shadow-sm", dims.core, coreClass)}
      />
    </div>
  );
}
