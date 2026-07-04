"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { SupportUserChoice } from "@/lib/chat-message-types";
import { cn } from "@/lib/utils";

type Props = {
  choices: SupportUserChoice[];
  onSelect: (choice: SupportUserChoice) => void;
  disabled?: boolean;
  className?: string;
};

export function SupportChoiceBar({ choices, onSelect, disabled, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || disabled) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    gsap.fromTo(
      el.children,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.24, stagger: 0.05, ease: "power2.out" }
    );
  }, [choices, disabled]);

  if (!choices.length) return null;

  return (
    <div
      ref={rootRef}
      className={cn("flex w-full flex-col gap-2", className)}
      data-ma-support="support-user-choices"
    >
      <p className="text-xs font-medium text-stone-500">چه کار کنم؟</p>
      <div className="flex flex-col gap-1.5">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            disabled={disabled}
            data-ma-support={`support-choice-${choice.id}`}
            onClick={() => onSelect(choice)}
            className={cn(
              "cursor-pointer rounded-xl border px-3 py-2.5 text-right text-sm transition-colors duration-200",
              "disabled:cursor-not-allowed disabled:opacity-50",
              choice.tone === "primary" &&
                "border-brand-300 bg-brand-50 text-brand-900 hover:border-brand-400 hover:bg-brand-100",
              choice.tone === "secondary" &&
                "border-stone-200 bg-white text-stone-800 hover:border-stone-300 hover:bg-stone-50",
              (!choice.tone || choice.tone === "ghost") &&
                "border-transparent bg-stone-50/80 text-stone-600 hover:bg-stone-100"
            )}
          >
            <span className="block font-semibold">{choice.label}</span>
            {choice.description ? (
              <span className="mt-0.5 block text-xs leading-relaxed opacity-80">
                {choice.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
