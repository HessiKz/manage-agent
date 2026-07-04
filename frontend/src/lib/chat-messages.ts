import type { ChatExchange } from "@/components/agents/chat-panel";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function appendChatExchange(
  messages: ChatMessage[],
  exchange: ChatExchange
): ChatMessage[] {
  return [
    ...messages,
    { role: "user", content: exchange.user },
    { role: "assistant", content: formatAssistantOutput(exchange.assistant) },
  ];
}

/** Replace trailing pending assistant bubble (empty) after a matching user line. */
export function finalizePendingExchange(
  messages: ChatMessage[],
  exchange: ChatExchange
): ChatMessage[] {
  const assistant = formatAssistantOutput(exchange.assistant);
  if (messages.length >= 2) {
    const last = messages[messages.length - 1];
    const prev = messages[messages.length - 2];
    if (
      last.role === "assistant" &&
      !last.content &&
      prev.role === "user" &&
      prev.content === exchange.user
    ) {
      return [...messages.slice(0, -1), { role: "assistant", content: assistant }];
    }
  }
  return appendChatExchange(messages, exchange);
}

export function appendPendingUserAction(
  messages: ChatMessage[],
  userLine: string
): ChatMessage[] {
  return [
    ...messages,
    { role: "user", content: userLine },
    { role: "assistant", content: "" },
  ];
}
