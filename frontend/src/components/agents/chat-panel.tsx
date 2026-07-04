"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatTurn } from "@/components/chat/chat-turn";
import { LoadingSpinner } from "@/components/loading/loading-indicator";
import type { MessageThinking } from "@/lib/chat-message-types";
import {
  deleteAgentFile,
  fetchAgentFiles,
  invokeAgent,
  invokeAgentStream,
  uploadAgentFile,
} from "@/lib/api";
import { handleApiError } from "@/lib/api-error-handler";
import { getErrorMessage } from "@/lib/errors";
import {
  filePolicyAcceptAttr,
  validateFileAgainstPolicy,
} from "@/lib/file-policy-utils";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import { useLlmStreamLoading, withGeneratingPhase } from "@/hooks/use-llm-stream-loading";
import { cn } from "@/lib/utils";
import type { Agent, AgentFilePolicy } from "@/types";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  thinking?: MessageThinking | string;
  isStreaming?: boolean;
};

export type ChatExchange = {
  user: string;
  assistant: string;
};

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
  /** Prefix for data-ma-support selectors (support agent automation). */
  automationPrefix?: string;
  /** Fill the compose box when a parent suggests a prompt (e.g. training chips). */
  prefillInput?: string | null;
  /** Optional file upload in compose row (e.g. training preview). */
  fileAttachment?: {
    agentId: string;
    policy: AgentFilePolicy;
    supportId?: string;
  };
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
  automationPrefix,
  prefillInput,
  fileAttachment,
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
  const llmLoading = useLlmStreamLoading();
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const threadId = useRef<string | undefined>(threadIdProp ?? undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const consumedExchangeRef = useRef<ChatExchange | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: attachedFiles = [] } = useQuery({
    queryKey: ["agent-files", fileAttachment?.agentId],
    queryFn: () => fetchAgentFiles(fileAttachment!.agentId),
    enabled: Boolean(fileAttachment?.agentId),
  });

  useEffect(() => {
    if (threadIdProp) threadId.current = threadIdProp;
  }, [threadIdProp]);

  useEffect(() => {
    if (initialMessage) setInput(initialMessage);
  }, [initialMessage]);

  useEffect(() => {
    if (prefillInput) setInput(prefillInput);
  }, [prefillInput]);

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
  }, [messages, loading, llmLoading.statusMessage, llmLoading.thinkingContent]);

  async function handleFilePick(fileList: FileList | null) {
    if (!fileAttachment || !fileList?.length) return;
    setFileError(null);
    setUploadingFile(true);
    try {
      for (const file of Array.from(fileList)) {
        const policyErr = validateFileAgainstPolicy(file, fileAttachment.policy);
        if (policyErr) {
          setFileError(policyErr);
          continue;
        }
        if (attachedFiles.length >= fileAttachment.policy.max_files) {
          setFileError(`حداکثر ${fileAttachment.policy.max_files} فایل مجاز است`);
          break;
        }
        await uploadAgentFile(fileAttachment.agentId, file);
      }
      await qc.invalidateQueries({ queryKey: ["agent-files", fileAttachment.agentId] });
    } catch (e: unknown) {
      setFileError(getErrorMessage(e));
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteAttachedFile(fileId: string) {
    if (!fileAttachment) return;
    setFileError(null);
    setDeletingFileId(fileId);
    try {
      await deleteAgentFile(fileAttachment.agentId, fileId);
      await qc.invalidateQueries({ queryKey: ["agent-files", fileAttachment.agentId] });
    } catch (e: unknown) {
      setFileError(getErrorMessage(e));
    } finally {
      setDeletingFileId(null);
    }
  }

  async function send(overrideText?: string) {
    if (!composable) return;
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    if (!overrideText) setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    setThinkingOpen(true);
    llmLoading.begin("در حال ارسال درخواست…");

    try {
      let assistant = "";
      setMessages((m) => [...m, { role: "assistant", content: "", isStreaming: true }]);

      const streamResult = await invokeAgentStream(
        agent.id,
        text,
        withGeneratingPhase((token) => {
          assistant += token;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = {
              role: "assistant",
              content: formatAssistantOutput(assistant),
              isStreaming: true,
            };
            return copy;
          });
        }, llmLoading),
        threadId.current,
        (finalOut) => {
          assistant = finalOut;
          const thinking = llmLoading.snapshotThinking();
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = {
              role: "assistant",
              content: formatAssistantOutput(finalOut),
              isStreaming: false,
              thinking: thinking ?? undefined,
            };
            return copy;
          });
        },
        llmLoading.callbacks
      );
      if (streamResult.output) {
        assistant = streamResult.output;
      }

      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        const thinking = llmLoading.snapshotThinking();
        if (last?.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: formatAssistantOutput(assistant || last.content),
            isStreaming: false,
            thinking: thinking ?? last.thinking,
          };
        }
        return copy;
      });

      if (!assistant) {
        const res = await invokeAgent(agent.id, text, threadId.current);
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: formatAssistantOutput(res.output),
            isStreaming: false,
          };
          return copy;
        });
      }
    } catch (e: unknown) {
      const apiErr = handleApiError(e, {
        event: "chat.invoke",
        toast: true,
        toastTitle: "خطا در گفت‌وگو",
      });
      setError(apiErr.message);
      setMessages((m) => m.filter((_, i) => i !== m.length - 1 || m[m.length - 1].content));
    } finally {
      setLoading(false);
      llmLoading.complete();
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
              <ChatTurn
                role={msg.role}
                content={msg.content}
                thinking={msg.thinking}
                isStreaming={msg.isStreaming}
                isPending={isPendingAssistant}
                loading={loading}
                phase={llmLoading.phase}
                statusMessage={llmLoading.statusMessage}
                liveThinkingContent={llmLoading.thinkingContent}
                thinkingActive={llmLoading.thinkingActive}
                thinkingSummary={llmLoading.thinkingSummary}
                thinkingOpen={thinkingOpen}
                onThinkingOpenChange={setThinkingOpen}
                automationPrefix={automationPrefix}
                animateEnter={msg.role === "assistant"}
              />
            </div>
          );
        })}
        {error && <p className="text-sm text-accent-red">{error}</p>}
      </div>

      {composable && (
        <div className="shrink-0 border-t border-surface-border p-3">
          {fileAttachment && attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachedFiles.slice(0, 8).map((f) => (
                <span
                  key={f.id}
                  className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] text-stone-700"
                  title={f.filename}
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-brand-600" />
                  <span className="truncate">{f.filename}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-stone-400 hover:text-accent-red disabled:opacity-50"
                    onClick={() => void handleDeleteAttachedFile(f.id)}
                    disabled={deletingFileId === f.id || uploadingFile}
                    aria-label={`حذف ${f.filename}`}
                  >
                    {deletingFileId === f.id ? (
                      <LoadingSpinner tone="neutral" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </span>
              ))}
            </div>
          )}
          {fileError && (
            <p className="mb-2 text-xs text-accent-red">{fileError}</p>
          )}
          <div className="flex gap-2">
            {fileAttachment && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 px-2.5"
                  data-ma-support={fileAttachment.supportId}
                  disabled={loading || uploadingFile || attachedFiles.length >= fileAttachment.policy.max_files}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="پیوست فایل"
                >
                  {uploadingFile ? (
                    <LoadingSpinner tone="neutral" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept={filePolicyAcceptAttr(fileAttachment.policy)}
                  onChange={(e) => void handleFilePick(e.target.files)}
                />
              </>
            )}
            <input
              data-ma-support={automationPrefix ? `${automationPrefix}-input` : undefined}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="پیام خود را بنویسید…"
              className="min-w-0 flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm"
              disabled={loading}
            />
            <Button
              type="button"
              className="shrink-0 transition-transform active:scale-[0.98]"
              data-ma-support={automationPrefix ? `${automationPrefix}-send` : undefined}
              onClick={() => send()}
              disabled={loading || !input.trim()}
            >
              {loading ? <LoadingSpinner tone="inverse" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
