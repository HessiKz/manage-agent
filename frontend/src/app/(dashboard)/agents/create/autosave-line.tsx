"use client";

import { useEffect, useState } from "react";

/** Real draft status — reflects the actual last localStorage write. */
export function AutosaveLine({ savedAt }: { savedAt: string | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 15000);
    return () => window.clearInterval(t);
  }, [savedAt]);

  if (!savedAt) {
    return (
      <p className="text-stone-400">
        <span className="font-semibold text-stone-600">پیش‌نویس</span> · هنوز ذخیره نشده
      </p>
    );
  }

  return (
    <p className="text-stone-500">
      <span className="font-semibold text-stone-700">پیش‌نویس</span> · ذخیره خودکار شد
      <span className="text-stone-400">
        {" "}
        · {timeAgo(savedAt)}
      </span>
    </p>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 10) return "همین حالا";
  if (sec < 60) return `${sec} ثانیه پیش`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} دقیقه پیش`;
  return new Date(iso).toLocaleTimeString("fa-IR");
}
