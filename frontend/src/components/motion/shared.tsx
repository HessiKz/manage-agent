"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export const BRAND_LOGO_LAYOUT_ID = "brand-logo";
const MORPH_SESSION_KEY = "ma_brand_morph";

export function setBrandMorphPending() {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(MORPH_SESSION_KEY, "1");
  }
}

type SharedLogoProps = {
  size: "hero" | "sidebar";
  className?: string;
};

export function SharedLogo({ size, className }: SharedLogoProps) {
  const [morphActive, setMorphActive] = useState(false);

  useEffect(() => {
    if (size !== "sidebar") return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(MORPH_SESSION_KEY) !== "1") return;

    setMorphActive(true);
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem(MORPH_SESSION_KEY);
      setMorphActive(false);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [size]);

  const heroClass =
    className ??
    "flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white shadow-glow";
  const sidebarClass =
    className ??
    "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-lg font-bold text-white shadow-glow";

  if (size === "hero") {
    return (
      <motion.div
        layoutId={BRAND_LOGO_LAYOUT_ID}
        layout={false}
        className={heroClass}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        AI
      </motion.div>
    );
  }

  return (
    <motion.div
      {...(morphActive ? { layoutId: BRAND_LOGO_LAYOUT_ID } : {})}
      layout={false}
      className={sidebarClass}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      AI
    </motion.div>
  );
}
