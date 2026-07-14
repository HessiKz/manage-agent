/** Shared LLM / agent loading phases and Persian labels. */

export type LlmLoadingPhase =
  | "idle"
  | "preparing"
  | "thinking"
  | "tools"
  | "generating"
  | "done";

export const LLM_PHASE_LABELS: Record<LlmLoadingPhase, string> = {
  idle: "آماده",
  preparing: "آماده‌سازی",
  thinking: "تفکر",
  tools: "اجرای ابزار",
  generating: "نوشتن پاسخ",
  done: "تمام",
};

export const LLM_PHASE_ORDER: LlmLoadingPhase[] = [
  "preparing",
  "thinking",
  "tools",
  "generating",
];

export function normalizeStreamPhase(raw: string): LlmLoadingPhase {
  switch (raw) {
    case "preparing":
      return "preparing";
    case "thinking":
      return "thinking";
    case "agent_run":
    case "tool":
    case "tools":
      return "tools";
    case "generating":
    case "writing":
    case "reasoning_complete":
      return "generating";
    default:
      return "preparing";
  }
}

/** One-line summary of streamed thinking for the status line. */
export function summarizeThinking(text: string, maxLen = 140): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "در حال تحلیل و برنامه‌ریزی…";

  const sentence = cleaned.split(/[.!?؟۔]\s+/)[0]?.trim() || cleaned;
  const base = sentence.length > maxLen ? `${sentence.slice(0, maxLen).trim()}…` : sentence;
  return base;
}

/** Collapse whitespace; keep tail for live updates. */
export function thinkingPreview(text: string, maxLen = 220): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `…${cleaned.slice(-maxLen)}`;
}

export type GenericLoadingStage = {
  id: string;
  label: string;
};

export const WIZARD_BOOTSTRAP_STAGES: GenericLoadingStage[] = [
  { id: "persist", label: "ذخیره و ساخت ایجنت" },
  { id: "upload", label: "آپلود فایل‌های نمونه" },
  { id: "instructions", label: "کامپایل دستورالعمل" },
  { id: "runtime", label: "آماده‌سازی محیط اجرا" },
  { id: "planning", label: "تحلیل و سؤالات ایجنت" },
  { id: "training", label: "راه‌اندازی تست تعاملی" },
];
