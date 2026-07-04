"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { useMounted } from "@/hooks/use-mounted";
import {
  fadePanelTransition,
  getFadePanelVariants,
  getPageVariants,
  getPanelVariants,
  pageTransition,
  panelTransition,
} from "./variants";

export function PageTransition({
  children,
  animateOnMount = false,
  animate = true,
  transitionKey,
}: {
  children: React.ReactNode;
  /** Marketing/auth: play enter on first paint */
  animateOnMount?: boolean;
  /** Set false to play exit (e.g. logout) */
  animate?: boolean;
  /** Defaults to pathname; combine with viewMode for shell swaps */
  transitionKey?: string;
}) {
  const mounted = useMounted();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const variants = useMemo(() => getPageVariants(!!reduced), [reduced]);
  const motionKey = transitionKey ?? pathname;

  if (!mounted) {
    return <div className="w-full">{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={motionKey}
        layout={false}
        variants={variants}
        initial={animateOnMount ? "initial" : false}
        animate={animate ? "animate" : "exit"}
        exit="exit"
        transition={pageTransition}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function PanelTransition({
  transitionKey,
  children,
  direction = "forward",
  preset = "slide",
  mode = "sync",
}: {
  transitionKey: string;
  children: React.ReactNode;
  direction?: "forward" | "backward";
  /** "fade" — lighter for wizards / heavy forms */
  preset?: "slide" | "fade";
  mode?: "sync" | "wait";
}) {
  const mounted = useMounted();
  const reduced = useReducedMotion();
  const variants = useMemo(
    () =>
      preset === "fade"
        ? getFadePanelVariants(!!reduced)
        : getPanelVariants(!!reduced, direction),
    [reduced, direction, preset]
  );
  const transition = preset === "fade" ? fadePanelTransition : panelTransition;

  if (!mounted) {
    return <div className="w-full">{children}</div>;
  }

  return (
    <AnimatePresence mode={mode} initial={false}>
      <motion.div
        key={transitionKey}
        layout={false}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={transition}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
