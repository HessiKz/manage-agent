"use client";

import { Briefcase, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/stores/ui-store";
import { easeOut } from "@/components/motion/variants";

type Props = {
  viewMode: ViewMode;
  onToggle: () => void;
  switching?: boolean;
  variant?: "header" | "sidebar";
  className?: string;
};

export function ViewModeToggle({
  viewMode,
  onToggle,
  switching = false,
  variant = "header",
  className,
}: Props) {
  const reduced = useReducedMotion();
  const isAdmin = viewMode === "admin";
  const label = isAdmin ? "نمای فضای کار" : "نمای ادمین";
  const shortLabel = isAdmin ? "فضای کار" : "ادمین";

  if (variant === "sidebar") {
    return (
      <motion.button
        type="button"
        onClick={onToggle}
        disabled={switching}
        layout
        whileTap={reduced ? undefined : { scale: 0.96 }}
        className={cn(
          "focus-ring-inset relative inline-flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200",
          isAdmin
            ? "bg-brand-500/25 text-brand-100 ring-1 ring-brand-400/40"
            : "bg-white/10 text-stone-300 hover:bg-white/20 hover:text-white",
          switching && "pointer-events-none opacity-80",
          className
        )}
        title="تغییر نما"
        aria-busy={switching}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isAdmin ? "admin" : "workspace"}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: easeOut }}
            className="inline-flex items-center gap-1"
          >
            {isAdmin ? (
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Briefcase className="h-3.5 w-3.5" aria-hidden />
            )}
            {shortLabel}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={switching}
      whileTap={reduced ? undefined : { scale: 0.98 }}
      className={cn(
        "btn-secondary relative inline-flex overflow-hidden px-2.5 py-2 text-xs sm:px-3",
        isAdmin && "border-brand-200 bg-brand-50 text-brand-800",
        switching && "pointer-events-none opacity-80",
        className
      )}
      title="تغییر نما"
      aria-busy={switching}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isAdmin ? "admin" : "workspace"}
          initial={reduced ? false : { opacity: 0, x: isAdmin ? 10 : -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? undefined : { opacity: 0, x: isAdmin ? -10 : 10 }}
          transition={{ duration: 0.18, ease: easeOut }}
          className="inline-flex items-center gap-1.5"
        >
          {isAdmin ? (
            <Briefcase className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{shortLabel}</span>
        </motion.span>
      </AnimatePresence>
      {!reduced && (
        <motion.span
          className="pointer-events-none absolute inset-0 bg-gradient-to-l from-brand-400/0 via-brand-400/15 to-brand-400/0"
          initial={{ x: "100%" }}
          animate={switching ? { x: "-100%" } : { x: "100%" }}
          transition={{ duration: 0.42, ease: easeOut }}
          aria-hidden
        />
      )}
    </motion.button>
  );
}
