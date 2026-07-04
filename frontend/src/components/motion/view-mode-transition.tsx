"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { ViewModeDirection } from "@/hooks/use-view-mode-switch";
import { viewModeSweepTransition } from "./variants";

type ViewModeSweepProps = {
  active: boolean;
  direction: ViewModeDirection;
};

/** Brand light-sweep across main content during workspace ↔ admin switch. */
export function ViewModeSweep({ active, direction }: ViewModeSweepProps) {
  const reduced = useReducedMotion();
  const sweepFrom = direction === "to-admin" ? "120%" : "-120%";
  const sweepTo = direction === "to-admin" ? "-120%" : "120%";

  const variants = useMemo(
    () =>
      reduced
        ? { initial: { opacity: 0 }, animate: { opacity: 0 }, exit: { opacity: 0 } }
        : {
            initial: { x: sweepFrom, opacity: 0.85 },
            animate: { x: sweepTo, opacity: 0 },
            exit: { opacity: 0 },
          },
    [reduced, sweepFrom, sweepTo]
  );

  return (
    <AnimatePresence>
      {active && !reduced && (
        <motion.div
          key={`sweep-${direction}`}
          className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          aria-hidden
        >
          <motion.div
            className="absolute inset-y-0 w-[55%] bg-gradient-to-l from-brand-400/35 via-brand-500/20 to-transparent"
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={viewModeSweepTransition}
          />
          <motion.div
            className="absolute inset-y-0 w-[38%] bg-gradient-to-l from-accent-green/25 via-transparent to-transparent"
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ ...viewModeSweepTransition, delay: 0.04 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
