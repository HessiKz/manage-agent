/**
 * Normalize assistant chat output for display (strip model scaffolding).
 * Keep in sync with backend `src/core/chat_sanitize.py`.
 */

const FENCE_BLOCK = /:::+(\w+)?\s*\n([\s\S]*?)\n:::+\s*/gm;
const ORPHAN_FENCE_LINE = /^:::+\s*\w*\s*$/gm;
const THINK_BLOCK = /[\s\S]*?<\/think>/gi;
const THINK_XML = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi;

const PREFERRED_FENCE_LABELS = [
  "writing",
  "reply",
  "response",
  "message",
  "answer",
  "output",
  "text",
] as const;

const META_START =
  /^[\s\S]{0,400}?(?:می‌تونیم|میتونیم|می‌توانیم|میتوانیم|here(?:'s| is)|below is|draft)(?:[\s\S]{0,120}?)(?:[:：]\s*|\n\n)/im;

const META_END =
  /\n\n[\s\S]{0,300}?(?:اگر بگی|اگه بگی|if you (?:tell|share|provide)|let me know|personali[sz]e|customi[sz]e|TK-\d+).*$/is;

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function stripReasoningWrappers(text: string): string {
  return text.replace(THINK_BLOCK, "").replace(THINK_XML, "");
}

function stripMetaWrappers(text: string): string {
  return text.replace(META_START, "").replace(META_END, "");
}

function extractFencedContent(text: string): string | null {
  const matches = [...text.matchAll(FENCE_BLOCK)];
  if (matches.length === 0) return null;

  const byLabel = new Map<string, string[]>();
  for (const m of matches) {
    const label = (m[1] ?? "").toLowerCase();
    const inner = (m[2] ?? "").trim();
    if (inner) {
      const list = byLabel.get(label) ?? [];
      list.push(inner);
      byLabel.set(label, list);
    }
  }

  for (const preferred of PREFERRED_FENCE_LABELS) {
    const parts = byLabel.get(preferred);
    if (parts?.length) return parts.join("\n\n");
  }

  if (matches.length === 1) return (matches[0][2] ?? "").trim();

  const parts = matches.map((m) => (m[2] ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

/** User-facing assistant message (no :::writing fences or meta preamble). */
export function sanitizeChatMessage(text: string, role: "user" | "assistant"): string {
  if (!text || role !== "assistant") return text;

  let cleaned = text.trim();
  cleaned = stripReasoningWrappers(cleaned);

  const fenced = extractFencedContent(cleaned);
  if (fenced !== null) {
    cleaned = fenced;
  } else {
    cleaned = cleaned.replace(ORPHAN_FENCE_LINE, "");
  }

  cleaned = stripMetaWrappers(cleaned);
  cleaned = cleaned.replace(ORPHAN_FENCE_LINE, "");
  return collapseBlankLines(cleaned);
}

const EMPTY_ASSISTANT_FALLBACK =
  "اجرای اقدام تکمیل شد؛ خروجی متنی دریافت نشد. در صورت نیاز دوباره تلاش کنید یا تاریخچه اجرا را ببینید.";

/** Sanitized assistant text with a user-visible fallback when empty. */
export function formatAssistantOutput(raw: string | undefined | null): string {
  const sanitized = sanitizeChatMessage(raw ?? "", "assistant");
  if (sanitized) return sanitized;
  const trimmed = (raw ?? "").trim();
  if (trimmed) return trimmed;
  return EMPTY_ASSISTANT_FALLBACK;
}
