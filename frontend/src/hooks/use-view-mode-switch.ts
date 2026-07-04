"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { type ViewMode, useUiStore } from "@/stores/ui-store";

export type ViewModeDirection = "to-admin" | "to-workspace";

const SWITCH_MS = 420;
const COMMIT_MS = 150;

export function useViewModeSwitch() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const [switching, setSwitching] = useState(false);
  const [direction, setDirection] = useState<ViewModeDirection>("to-admin");
  const lockRef = useRef(false);

  const switchViewMode = useCallback(() => {
    if (lockRef.current) return;

    const toAdmin = viewMode !== "admin";
    const next: ViewMode = toAdmin ? "admin" : "workspace";
    const dir: ViewModeDirection = toAdmin ? "to-admin" : "to-workspace";

    if (reduced) {
      setViewMode(next);
      router.push(toAdmin ? "/admin" : "/dashboard");
      return;
    }

    lockRef.current = true;
    setDirection(dir);
    setSwitching(true);

    window.setTimeout(() => {
      setViewMode(next);
      router.push(toAdmin ? "/admin" : "/dashboard");
    }, COMMIT_MS);

    window.setTimeout(() => {
      setSwitching(false);
      lockRef.current = false;
    }, SWITCH_MS);
  }, [reduced, router, setViewMode, viewMode]);

  return { viewMode, switchViewMode, switching, direction };
}
