"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { InvokeStreamCallbacks } from "@/lib/api";
import type { MessageThinking } from "@/lib/chat-message-types";
import {
  LLM_PHASE_LABELS,
  normalizeStreamPhase,
  summarizeThinking,
  type LlmLoadingPhase,
} from "@/lib/llm-loading-state";

export function buildThinkingSnapshot(
  content: string,
  phase: LlmLoadingPhase = "done"
): MessageThinking | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;
  return {
    content: trimmed,
    summary: summarizeThinking(trimmed),
    phase,
  };
}

export function useLlmStreamLoading() {
  const [phase, setPhase] = useState<LlmLoadingPhase>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [thinkingContent, setThinkingContent] = useState("");
  const [thinkingActive, setThinkingActive] = useState(false);
  const thinkingRef = useRef("");
  const phaseRef = useRef<LlmLoadingPhase>("idle");
  const sawTokenRef = useRef(false);

  const reset = useCallback(() => {
    setPhase("idle");
    phaseRef.current = "idle";
    setStatusMessage("");
    setThinkingContent("");
    setThinkingActive(false);
    thinkingRef.current = "";
    sawTokenRef.current = false;
  }, []);

  const begin = useCallback((initialMessage = "در حال آماده‌سازی…") => {
    sawTokenRef.current = false;
    thinkingRef.current = "";
    setPhase("preparing");
    phaseRef.current = "preparing";
    setStatusMessage(initialMessage);
    setThinkingContent("");
    setThinkingActive(false);
  }, []);

  const callbacks: InvokeStreamCallbacks = useMemo(
    () => ({
      onPhase: (rawPhase, message) => {
        const next = normalizeStreamPhase(rawPhase);
        setPhase(next);
        phaseRef.current = next;
        if (message.trim()) setStatusMessage(message.trim());
      },
      onThinkingStart: () => {
        setPhase("thinking");
        phaseRef.current = "thinking";
        setThinkingActive(true);
        thinkingRef.current = "";
        setThinkingContent("");
        setStatusMessage("در حال تحلیل و برنامه‌ریزی…");
      },
      onThinkingToken: (token) => {
        thinkingRef.current += token;
        setThinkingContent(thinkingRef.current);
        setStatusMessage(summarizeThinking(thinkingRef.current));
      },
      onThinkingEnd: (summary) => {
        setThinkingActive(false);
        if (summary?.trim()) {
          setStatusMessage(summary.trim());
        } else if (thinkingRef.current.trim()) {
          setStatusMessage(summarizeThinking(thinkingRef.current));
        } else {
          setStatusMessage("تحلیل کامل شد — در حال آماده‌سازی پاسخ…");
        }
        if (!sawTokenRef.current) {
          setPhase("generating");
          phaseRef.current = "generating";
        }
      },
      onStatus: (message) => {
        setPhase("tools");
        phaseRef.current = "tools";
        setStatusMessage(message.trim());
      },
      onGeneratingStart: () => {
        setPhase("generating");
        phaseRef.current = "generating";
        setStatusMessage("در حال نوشتن پاسخ…");
      },
      onToken: () => {
        sawTokenRef.current = true;
        setPhase("generating");
        phaseRef.current = "generating";
      },
    }),
    []
  );

  const thinkingSummary = summarizeThinking(thinkingContent);
  const isActive = phase !== "idle" && phase !== "done";

  const snapshotThinking = useCallback((): MessageThinking | undefined => {
    return buildThinkingSnapshot(thinkingRef.current, phaseRef.current);
  }, []);

  return {
    phase,
    phaseLabel: LLM_PHASE_LABELS[phase],
    statusMessage,
    thinkingContent,
    thinkingSummary,
    thinkingActive,
    isActive,
    callbacks,
    reset,
    begin,
    complete: () => {
      setPhase("done");
      phaseRef.current = "done";
    },
    snapshotThinking,
  };
}

/** Wrap stream token handler to mark generating phase. */
export function withGeneratingPhase(
  onToken: (token: string) => void,
  loading: ReturnType<typeof useLlmStreamLoading>
) {
  return (token: string) => {
    loading.callbacks.onToken?.();
    onToken(token);
  };
}
