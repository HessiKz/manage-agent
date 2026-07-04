"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ChatMessageContent } from "@/components/agents/chat-message-content";
import { LlmProcessIndicator } from "@/components/loading/llm-process-indicator";
import { SupportTaskIndicator } from "@/components/support/support-task-indicator";
import {
  normalizeThinking,
  thinkingContent,
  type MessageThinking,
  type MessageUiTask,
} from "@/lib/chat-message-types";
import type { LlmLoadingPhase } from "@/lib/llm-loading-state";
import { cn } from "@/lib/utils";

type Props = {
  role: "user" | "assistant";
  content: string;
  thinking?: MessageThinking | string;
  uiTask?: MessageUiTask | null;
  isStreaming?: boolean;
  isPending?: boolean;
  loading?: boolean;
  phase?: LlmLoadingPhase;
  statusMessage?: string;
  liveThinkingContent?: string;
  thinkingActive?: boolean;
  thinkingSummary?: string;
  thinkingOpen?: boolean;
  onThinkingOpenChange?: (open: boolean) => void;
  bubbleClassName?: string;
  footer?: ReactNode;
  automationPrefix?: string;
  animateEnter?: boolean;
  onStopUiTask?: () => void;
};

export function ChatTurn({
  role,
  content,
  thinking,
  uiTask,
  isStreaming,
  isPending,
  loading,
  phase = "idle",
  statusMessage = "",
  liveThinkingContent = "",
  thinkingActive = false,
  thinkingSummary,
  thinkingOpen,
  onThinkingOpenChange,
  bubbleClassName,
  footer,
  automationPrefix,
  animateEnter = false,
  onStopUiTask,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isUser = role === "user";
  const showLiveThinking = Boolean(isPending && loading && phase !== "idle");
  const persisted = normalizeThinking(thinking);
  const showPersistedThinking = Boolean(!isUser && persisted);
  const persistedSummary = persisted?.summary ?? thinkingSummary;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !animateEnter || isUser) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    gsap.fromTo(
      el,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" }
    );
  }, [animateEnter, isUser]);

  if (
    !isUser &&
    !content.trim() &&
    !showLiveThinking &&
    !showPersistedThinking &&
    !uiTask
  ) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className={cn("flex flex-col gap-2", isUser ? "items-start" : "items-end")}
    >
      {showLiveThinking ? (
        <LlmProcessIndicator
          phase={phase}
          statusMessage={statusMessage}
          thinkingContent={liveThinkingContent}
          thinkingActive={thinkingActive}
          thinkingSummary={thinkingSummary}
          thinkingOpen={thinkingOpen}
          onThinkingOpenChange={onThinkingOpenChange}
          variant="bubble"
          className="max-w-[92%] w-full"
        />
      ) : null}

      {showPersistedThinking && persisted ? (
        <LlmProcessIndicator
          phase={persisted.phase ?? "done"}
          statusMessage="فرآیند تفکر"
          thinkingContent={persisted.content}
          thinkingActive={false}
          thinkingSummary={persistedSummary}
          thinkingOpen={thinkingOpen ?? false}
          onThinkingOpenChange={onThinkingOpenChange}
          variant="bubble"
          className="max-w-[92%] w-full opacity-95"
        />
      ) : null}

      {content.trim() ? (
        <div className={cn("flex max-w-[92%]", isUser ? "justify-start" : "justify-end")}>
          <div
            data-ma-support={
              automationPrefix && !isUser
                ? `${automationPrefix}-assistant`
                : undefined
            }
            className={cn(
              "rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm",
              isUser ? "bg-brand-100" : "bg-brand-600",
              bubbleClassName
            )}
          >
            <ChatMessageContent
              content={content}
              variant={role}
              isStreaming={Boolean(isStreaming)}
            />
          </div>
        </div>
      ) : null}

      {uiTask && onStopUiTask ? (
        <SupportTaskIndicator
          active
          label={uiTask.label}
          progress={{
            step: uiTask.step,
            total: uiTask.total,
            label: uiTask.status,
            scriptLabel: uiTask.label,
          }}
          onStop={onStopUiTask}
          className="max-w-[92%] w-full"
        />
      ) : null}

      {footer}
    </div>
  );
}

export { thinkingContent };
