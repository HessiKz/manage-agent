import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEPT_LABELS: Record<string, string> = {
  finance: "مالی",
  hr: "منابع انسانی",
  support: "پشتیبانی",
  sales: "فروش",
  ops: "عملیات",
};

export function deptLabel(dept?: string) {
  if (!dept) return "—";
  return DEPT_LABELS[dept] ?? dept;
}

/**
 * Metric deltas for RTL pages — moves trailing "+" before the number
 * so "+۱۷۷٪" stays on one line inside badges (avoids "۱۷۷٪" / "+" split).
 */
export function formatMetricDelta(raw: string): string {
  const t = raw.trim();
  const trailingPlus = t.match(/^(.+?)([٪%])(\+|＋)$/u);
  if (trailingPlus) return `+${trailingPlus[1]}${trailingPlus[2]}`;
  return t;
}

/** True when a label/hint should render in an LTR isolate (digits, %, +). */
export function hasMetricSymbols(text: string): boolean {
  return /[0-9۰-۹٪%+\-↗↘]/.test(text);
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    active: "فعال",
    draft: "پیش‌نویس",
    paused: "متوقف",
    error: "خطا",
    deploying: "در حال استقرار",
    archived: "بایگانی",
  };
  return map[status] ?? status;
}
