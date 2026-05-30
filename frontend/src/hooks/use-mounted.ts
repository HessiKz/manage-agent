"use client";

import { useEffect, useState } from "react";

/** True only after the client has mounted — use to avoid SSR/client HTML mismatches. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
