"use client";

import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";
import React, {
  createContext,
  createElement,
  useContext,
  useMemo,
} from "react";
import { usePathname } from "next/navigation";
import { useMounted } from "@/hooks/use-mounted";
import {
  getItemVariant,
  getStaggerContainer,
  itemTransition,
  type MotionVariantName,
} from "./variants";

const StaggerOrchestratedContext = createContext(false);

function resolveMotionTag(tag: keyof JSX.IntrinsicElements) {
  const candidate = (motion as unknown as Record<string, unknown>)[tag];
  if (
    typeof candidate === "function" ||
    (typeof candidate === "object" &&
      candidate !== null &&
      "$$typeof" in candidate)
  ) {
    return candidate as typeof motion.div;
  }
  return motion.div;
}

type StaggerProps = {
  children: React.ReactNode;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  delayChildren?: number;
  staggerChildren?: number;
  direction?: "forward" | "reverse";
  /** Whether the parent is in the "in" or "out" state. true = animate to "animate", false = animate to "exit". */
  animate?: boolean;
  /** If false, skip mount animation and start in the "animate" state. */
  initial?: boolean;
  replayOnRoute?: boolean;
  /** Bypass motion entirely (use plain DOM). */
  disabled?: boolean;
};

export function Stagger({
  children,
  className,
  as = "div",
  delayChildren = 0.04,
  staggerChildren = 0.05,
  direction = "forward",
  animate = true,
  initial = true,
  replayOnRoute = false,
  disabled = false,
}: StaggerProps) {
  const mounted = useMounted();
  const pathname = usePathname();
  const replayKey = replayOnRoute ? pathname : undefined;
  const reduced = useReducedMotion();
  const variants = useMemo(
    () =>
      getStaggerContainer(!!reduced, {
        delayChildren,
        staggerChildren,
        reverse: direction === "reverse",
      }),
    [reduced, delayChildren, staggerChildren, direction]
  );

  if (disabled || !mounted) {
    return (
      <StaggerOrchestratedContext.Provider value={false}>
        {createElement(as, { className }, children)}
      </StaggerOrchestratedContext.Provider>
    );
  }

  const props: HTMLMotionProps<"div"> = {
    key: replayKey,
    className,
    variants,
    initial: initial ? "initial" : false,
    animate: animate ? "animate" : "exit",
    exit: "exit",
  };

  const MotionTag = resolveMotionTag(as);

  return (
    <StaggerOrchestratedContext.Provider value={true}>
      {createElement(MotionTag, props, children)}
    </StaggerOrchestratedContext.Provider>
  );
}

type StaggerItemProps = {
  children: React.ReactNode;
  variant?: MotionVariantName;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  customTransition?: { duration?: number; delay?: number };
} & Omit<HTMLMotionProps<"div">, "variants" | "initial" | "animate" | "exit" | "transition">;

export function StaggerItem({
  children,
  variant = "slideUp",
  className,
  as = "div",
  customTransition,
  ...rest
}: StaggerItemProps) {
  const orchestrated = useContext(StaggerOrchestratedContext);
  const reduced = useReducedMotion();
  const variants = useMemo(
    () => getItemVariant(variant, !!reduced),
    [variant, reduced]
  );
  const transition = useMemo(
    () => ({
      ...itemTransition,
      ...customTransition,
    }),
    [customTransition]
  );

  if (!orchestrated) {
    return createElement(as, { className, ...rest }, children);
  }

  if (as === "tr") {
    const { onClick } = rest;
    return (
      <motion.tr
        className={className}
        variants={variants}
        transition={transition}
        onClick={onClick}
      >
        {children}
      </motion.tr>
    );
  }

  const MotionTag = resolveMotionTag(as);
  const props: HTMLMotionProps<"div"> = {
    ...rest,
    className,
    variants,
    transition,
  };

  return createElement(MotionTag, props, children);
}

export function MotionReveal({
  children,
  variant = "slideUp",
  className,
  as = "div",
  animate = true,
  initial = true,
}: {
  children: React.ReactNode;
  variant?: MotionVariantName;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  animate?: boolean;
  initial?: boolean;
}) {
  const mounted = useMounted();
  const reduced = useReducedMotion();
  const variants = useMemo(
    () => getItemVariant(variant, !!reduced),
    [variant, reduced]
  );

  if (!mounted) {
    return createElement(as, { className }, children);
  }

  const props: HTMLMotionProps<"div"> = {
    className,
    variants,
    initial: initial ? "initial" : false,
    animate: animate ? "animate" : "exit",
    exit: "exit",
    transition: itemTransition,
  };

  const MotionTag = resolveMotionTag(as);
  return createElement(MotionTag, props, children);
}
