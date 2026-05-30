"use client";

import { LayoutGroup } from "framer-motion";

/** Global layout group for login ↔ dashboard shared-element morph only. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LayoutGroup id="ma-root">{children}</LayoutGroup>;
}
