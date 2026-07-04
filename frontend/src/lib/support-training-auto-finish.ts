import { invokeAgentStream } from "@/lib/api";
import { sleepAbortable, throwIfSupportAborted } from "@/lib/support-abort";
import { waitForDomSelector } from "@/lib/support-automation-bridge";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import type { ChatMessage } from "@/components/agents/chat-panel";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";

export async function waitForTrainingAssistantReply(timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    const assistants = document.querySelectorAll('[data-ma-support="training-chat-assistant"]');
    const last = assistants[assistants.length - 1];
    const text = last?.textContent?.trim() ?? "";
    const pending = document.querySelector(
      '[data-ma-support="training-chat-assistant-pending"]'
    );
    const loading = document.querySelector('[data-ma-support="training-chat-send"] .animate-spin');
    if (text.length > 8 && !loading && !pending) return;
    await sleepAbortable(300);
  }
  throw new Error("پاسخ ایجنت در آموزش تعاملی دریافت نشد — چت انجام نشد");
}

export function readLatestTrainingAssistantReply(): string {
  const assistants = document.querySelectorAll('[data-ma-support="training-chat-assistant"]');
  const last = assistants[assistants.length - 1];
  return last?.textContent?.trim() ?? "";
}

export async function runVisibleTrainingChat(
  agentId: string,
  userLine: string,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  messagesRef: MutableRefObject<ChatMessage[]>,
  ctx: SupportPlayerContext
): Promise<void> {
  await ctx.setStatus("ارسال پیام آموزشی به ایجنت…");
  setMessages([
    { role: "user", content: userLine },
    { role: "assistant", content: "" },
  ]);
  messagesRef.current = [
    { role: "user", content: userLine },
    { role: "assistant", content: "" },
  ];

  let assistant = "";
  await invokeAgentStream(agentId, userLine, (token) => {
    assistant += token;
    const formatted = formatAssistantOutput(assistant);
    const exchange: ChatMessage[] = [
      { role: "user", content: userLine },
      { role: "assistant", content: formatted },
    ];
    messagesRef.current = exchange;
    setMessages(exchange);
  });

  if (!assistant.trim()) {
    throw new Error("ایجنت پاسخی برنگرداند — آموزش تعاملی انجام نشد");
  }
  await waitForTrainingAssistantReply();
}
