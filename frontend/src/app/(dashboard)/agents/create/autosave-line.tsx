"use client";

import { useEffect, useState } from "react";

/** Isolated timer so the wizard body does not re-render every second. */
export function AutosaveLine() {
  const [autosaveSeconds, setAutosaveSeconds] = useState(12);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => {
      setAutosaveSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (autosaveSeconds === 0) {
      setLastSavedAt(new Date());
      setAutosaveSeconds(12);
    }
  }, [autosaveSeconds]);

  return (
    <p className="text-stone-500">
      <span className="font-semibold text-stone-700">پیش‌نویس</span> · ذخیره خودکار{" "}
      {autosaveSeconds} ثانیه پیش
      {lastSavedAt && (
        <span className="text-stone-400">
          {" "}
          · آخرین ذخیره: {lastSavedAt.toLocaleTimeString("fa-IR")}
        </span>
      )}
    </p>
  );
}
