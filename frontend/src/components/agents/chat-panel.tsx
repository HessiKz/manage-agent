"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessageContent } from "@/components/agents/chat-message-content";
import { invokeAgent, invokeAgentStream } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatExchange = {
  user: string;
  assistant: string;
};

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only">در حال تایپ…</span>
      <span className="h-2 w-2 animate-bounce rounded-full bg-white/90 [animation-delay:-0.2s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-white/90 [animation-delay:-0.1s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-white/90" />
    </div>
  );
}

type Props = {
  agent: Agent;
  initialMessage?: string | null;
  /** Resume an existing server thread (multi-turn memory on backend). */
  threadId?: string | null;
  /** When false, show messages only — no user input (worker / file-intake agents). */
  composable?: boolean;
  /** Controlled message list (persists across tab switches). */
  messages?: ChatMessage[];
  onMessagesChange?: Dispatch<SetStateAction<ChatMessage[]>>;
  /** Legacy: append via parent instead of using exchange effect. */
  exchange?: ChatExchange | null;
  onExchangeConsumed?: () => void;
};

export function ChatPanel({
  agent,
  initialMessage,
  threadId: threadIdProp,
  composable = true,
  messages: controlledMessages,
  onMessagesChange,
  exchange,
  onExchangeConsumed,
}: Props) {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const isControlled = controlledMessages !== undefined;
  const messages = isControlled ? controlledMessages : internalMessages;

  const setMessages = useCallback(
    (updater: SetStateAction<ChatMessage[]>) => {
      if (isControlled && onMessagesChange) {
        onMessagesChange(updater);
      } else {
        setInternalMessages(updater);
      }
    },
    [isControlled, onMessagesChange]
  );

  const [input, setInput] = useState(initialMessage ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadId = useRef<string | undefined>(threadIdProp ?? undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const consumedExchangeRef = useRef<ChatExchange | null>(null);

  useEffect(() => {
    if (threadIdProp) threadId.current = threadIdProp;
  }, [threadIdProp]);

  useEffect(() => {
    if (initialMessage) setInput(initialMessage);
  }, [initialMessage]);

  useEffect(() => {
    if (!exchange || isControlled) return;
    if (
      consumedExchangeRef.current?.user === exchange.user &&
      consumedExchangeRef.current?.assistant === exchange.assistant
    ) {
      return;
    }
    consumedExchangeRef.current = exchange;
    setMessages((m) => [
      ...m,
      { role: "user", content: exchange.user },
      { role: "assistant", content: formatAssistantOutput(exchange.assistant) },
    ]);
    onExchangeConsumed?.();
  }, [exchange, onExchangeConsumed, isControlled, setMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(overrideText?: string) {
    if (!composable) return;
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    if (!overrideText) setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);

    try {
      let assistant = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      await invokeAgentStream(agent.id, text, (token) => {
        assistant += token;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: formatAssistantOutput(assistant),
          };
          return copy;
        });
      }, threadId.current);

      if (!assistant) {
        const res = await invokeAgent(agent.id, text, threadId.current);
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: formatAssistantOutput(res.output),
          };
          return copy;
        });
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e));
      setMessages((m) => m.filter((_, i) => i !== m.length - 1 || m[m.length - 1].content));
    } finally {
      setLoading(false);
    }
  }

  const hasContent = messages.length > 0 || loading;
  const lastIndex = messages.length - 1;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-surface-border bg-white transition-[min-height] duration-200 ease-out",
        hasContent && "min-h-[11rem] max-h-[min(50vh,28rem)]"
      )}
    >
      <div
        ref={scrollRef}
        className={cn(
          "space-y-3 overflow-y-auto p-3",
          hasContent && "min-h-0 flex-1"
        )}
      >
        {!hasContent && (
          <p className="py-1 text-center text-sm text-stone-500">
            {composable
              ? "یک سؤال بپرس یا از «تست ادمین» استفاده کن"
              : "نتیجه اجراها اینجا نمایش داده می‌شود — از اقدامات یا تست ادمین استفاده کنید"}
          </p>
        )}
        {messages.map((msg, i) => {
          const isPendingAssistant =
            msg.role === "assistant" && !msg.content.trim() && i === lastIndex;

          if (msg.role === "assistant" && !msg.content.trim() && !isPendingAssistant) {
            return null;
          }

          return (
            <div
              key={`msg-${i}-${msg.role}-${msg.content.slice(0, 24)}`}
              className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-3 py-2 ${
                  msg.role === "user" ? "bg-brand-100" : "bg-brand-600"
                }`}
              >
                {msg.content.trim() ? (
                  <ChatMessageContent content={msg.content} variant={msg.role} />
                ) : isPendingAssistant ? (
                  <TypingIndicator />
                ) : null}
              </div>
            </div>
          );
        })}
        {error && <p className="text-sm text-accent-red">{error}</p>}
      </div>

      <div className="shrink-0 border-t border-surface-border p-3">
        {composable ? (
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="پیام خود را بنویسید…"
              className="min-w-0 flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm"
              disabled={loading}
            />
            <Button
              type="button"
              className="shrink-0"
              onClick={() => send()}
              disabled={loading || !input.trim()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <p className="text-center text-xs text-stone-500">
            گفت‌وگوی آزاد برای این ایجنت غیرفعال است — فقط نتایج اجرا نمایش داده می‌شود.
          </p>
        )}
      </div>
    </div>
  );
}
