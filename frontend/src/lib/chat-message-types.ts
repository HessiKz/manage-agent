import type { LlmLoadingPhase } from "@/lib/llm-loading-state";

export type MessageThinking = {
  content: string;
  summary?: string;
  phase?: LlmLoadingPhase;
};

export type MessageUiTask = {
  label: string;
  step: number;
  total: number;
  status: string;
};

export type SupportUserChoice = {
  id: string;
  label: string;
  description?: string;
  tone?: "primary" | "secondary" | "ghost";
};

export function normalizeThinking(
  raw: MessageThinking | string | undefined
): MessageThinking | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    const content = raw.trim();
    return content ? { content } : undefined;
  }
  if (!raw.content?.trim()) return undefined;
  return raw;
}

export function thinkingContent(raw: MessageThinking | string | undefined): string {
  return normalizeThinking(raw)?.content ?? "";
}
