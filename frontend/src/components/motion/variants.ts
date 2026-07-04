import type { Transition, Variants } from "framer-motion";

export const easeOut: Transition["ease"] = [0.22, 1, 0.36, 1];

export type MotionVariantName =
  | "slideRight"
  | "slideLeft"
  | "slideUp"
  | "slideDown"
  | "scaleIn"
  | "popIn"
  | "fadeIn";

const REDUCED_ITEM: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const ITEM_VARIANTS: Record<MotionVariantName, Variants> = {
  slideRight: {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -16 },
  },
  slideLeft: {
    initial: { opacity: 0, x: -24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 16 },
  },
  slideUp: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  },
  slideDown: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
  },
  popIn: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
};

export function getItemVariant(name: MotionVariantName, reduced: boolean): Variants {
  if (reduced) return REDUCED_ITEM;
  return ITEM_VARIANTS[name];
}

export function getStaggerContainer(
  reduced: boolean,
  opts?: { delayChildren?: number; staggerChildren?: number; reverse?: boolean }
): Variants {
  if (reduced) {
    return { initial: {}, animate: {}, exit: {} };
  }
  const delay = opts?.delayChildren ?? 0.04;
  const stagger = opts?.staggerChildren ?? 0.05;
  return {
    initial: { opacity: 1 },
    animate: {
      opacity: 1,
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
        staggerDirection: opts?.reverse ? -1 : 1,
        when: "beforeChildren",
      },
    },
    exit: {
      opacity: 1,
      transition: {
        staggerChildren: stagger,
        staggerDirection: opts?.reverse ? 1 : -1,
        when: "afterChildren",
      },
    },
  };
}

export function getPageVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    };
  }
  // Slide only — opacity on the wrapper hides child StaggerItem fades
  return {
    initial: { y: 8 },
    animate: { y: 0 },
    exit: { y: -6 },
  };
}

/** `/`, `/login`, etc. — visible cross-route fade (not used on dashboard main) */
export function getMarketingRouteVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    };
  }
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  };
}

/** Directional slide for home ↔ login (RTL: forward = enter from right) */
export function getMarketingRouteVariantsDirected(
  reduced: boolean,
  direction: "forward" | "backward"
): Variants {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    };
  }
  const enterX = direction === "forward" ? 28 : -28;
  const exitX = direction === "forward" ? -20 : 20;
  return {
    initial: { opacity: 0, x: enterX, y: 6 },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, x: exitX, y: -6 },
  };
}

export function getPanelVariants(
  reduced: boolean,
  direction: "forward" | "backward" = "forward"
): Variants {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    };
  }
  const enterX = direction === "forward" ? 20 : -20;
  const exitX = direction === "forward" ? -16 : 16;
  return {
    initial: { x: enterX },
    animate: { x: 0 },
    exit: { x: exitX },
  };
}

/** Lightweight step/tab swap — opacity only, no x-transform on heavy forms */
export function getFadePanelVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    };
  }
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };
}

/** Workspace ↔ admin shell swap (RTL-aware horizontal drift). */
export function getViewModeNavVariants(
  reduced: boolean,
  direction: "to-admin" | "to-workspace"
): Variants {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    };
  }
  const enterX = direction === "to-admin" ? 28 : -28;
  const exitX = direction === "to-admin" ? -20 : 20;
  return {
    initial: { opacity: 0, x: enterX },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: exitX },
  };
}

export const viewModeNavTransition: Transition = { duration: 0.22, ease: easeOut };
export const viewModeSweepTransition: Transition = { duration: 0.42, ease: easeOut };

export const itemTransition: Transition = { duration: 0.16, ease: easeOut };
export const pageTransition: Transition = { duration: 0.18, ease: easeOut };
export const panelTransition: Transition = { duration: 0.16, ease: easeOut };
export const fadePanelTransition: Transition = { duration: 0.12, ease: easeOut };
