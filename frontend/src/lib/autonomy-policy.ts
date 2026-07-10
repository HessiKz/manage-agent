/** Graduated autonomy policy (Phase 1 M3) — frontend gate mirror.

Levels:
  0 observe — text suggestions only; no UI automation.
  1 assist  — highlight/fill; user confirms (default for new users).
  2 auto    — run bridges; pause on blockers (default for admins).
  3 unattended — full pipeline until validation; gated.
*/

export type AutonomyLevel = 0 | 1 | 2 | 3;

export type AutomationAction = "suggest" | "fill" | "bridge" | "full";

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  0: "مشاهده",
  1: "یاری",
  2: "خودکار",
  3: "بدون نظارت",
};

export const AUTONOMY_HELPERS: Record<AutonomyLevel, string> = {
  0: "فقط پیشنهاد متنی — بدون اجرای خودکار در رابط",
  1: "پرکردن و برجسته‌سازی — با تأیید کاربر",
  2: "اجرای بریج‌ها — توقف در صورت مسدودیت",
  3: "خط لوله کامل تا اعتبارسنجی — مشروط",
};

/** Minimum autonomy level required for each action. */
const ACTION_MIN_LEVEL: Record<AutomationAction, AutonomyLevel> = {
  suggest: 0,
  fill: 1,
  bridge: 2,
  full: 3,
};

export function coerceLevel(value: unknown): AutonomyLevel {
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (Number.isInteger(n) && n >= 0 && n <= 3) return n as AutonomyLevel;
  return 1;
}

export function canRunAutomation(level: AutonomyLevel, action: AutomationAction): boolean {
  return level >= ACTION_MIN_LEVEL[action];
}

export const AUTONOMY_BLOCKED_FA =
  "برای اجرای خودکار، سطح خودمختاری را در تنظیمات افزایش دهید";
