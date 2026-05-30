"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAgentActions,
  fetchAgentFiles,
  fetchAgentLinkGraph,
  fetchAgentTemplates,
} from "@/lib/api";
import { ChatPanel, type ChatExchange, type ChatMessage } from "@/components/agents/chat-panel";
import { WorkerActionGrid } from "@/components/agents/worker-action-grid";
import { TemplateQuickPicker } from "@/components/agents/template-quick-picker";
import { FileIntakePanel } from "@/components/agents/file-intake-panel";
import { SupervisorGraph } from "@/components/agents/supervisor-graph";
import type { Agent } from "@/types";

export type CapabilityPanelVariant = "full" | "run" | "chat";

type Props = {
  agent: Agent;
  initialMessage?: string | null;
  chatMessages?: ChatMessage[];
  onChatMessagesChange?: Dispatch<SetStateAction<ChatMessage[]>>;
  chatExchange?: ChatExchange | null;
  onChatExchange?: (exchange: ChatExchange) => void;
  onChatExchangeConsumed?: () => void;
  onActionRunStart?: (userLine: string) => void;
  chatThreadId?: string | null;
  /** `run` = actions/files only (execution tab). `chat` = chat tab only. */
  variant?: CapabilityPanelVariant;
};

export function CapabilityAwarePanel({
  agent,
  initialMessage,
  chatMessages,
  onChatMessagesChange,
  chatExchange,
  onChatExchange,
  onChatExchangeConsumed,
  onActionRunStart,
  chatThreadId,
  variant = "full",
}: Props) {
  const showChat = variant === "full" || variant === "chat";
  const showRunTools = variant === "full" || variant === "run";
  const caps = agent.capabilities ?? {
    chat_enabled: true,
    file_upload_enabled: false,
    actions_enabled: false,
    templates_enabled: false,
    can_call_agents: false,
    supervisor_enabled: false,
  };
  const filePolicy = agent.file_policy ?? {
    min_files: 1,
    max_files: 100,
    max_file_size_mb: 25,
    max_total_size_mb: 500,
    allowed_mime_types: ["application/pdf"],
    allowed_extensions: [".pdf"],
    require_files_to_invoke: false,
    auto_ingest_to_rag: true,
  };

  const chatComposable = caps.chat_enabled;
  const [chatSeed, setChatSeed] = useState(initialMessage ?? "");

  useEffect(() => {
    if (initialMessage) setChatSeed(initialMessage);
  }, [initialMessage]);

  const { data: actions = [] } = useQuery({
    queryKey: ["agent-actions", agent.id],
    queryFn: () => fetchAgentActions(agent.id),
    enabled: caps.actions_enabled,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["agent-templates", agent.id],
    queryFn: () => fetchAgentTemplates(agent.id),
    enabled: caps.templates_enabled,
  });

  const { data: files = [] } = useQuery({
    queryKey: ["agent-files", agent.id],
    queryFn: () => fetchAgentFiles(agent.id),
    enabled: caps.file_upload_enabled,
  });

  useQuery({
    queryKey: ["agent-link-graph", agent.id],
    queryFn: () => fetchAgentLinkGraph(agent.id),
    enabled: caps.supervisor_enabled,
  });

  const chatShell =
    variant === "chat"
      ? "flex h-full min-h-0 flex-col overflow-hidden"
      : "flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-card";

  return (
    <div
      className={
        variant === "chat"
          ? "flex h-full min-h-0 flex-col gap-3"
          : variant === "run"
            ? "flex flex-col gap-3"
            : "flex h-full min-h-0 flex-col gap-3"
      }
    >
      {showChat && (
        <div className={chatShell}>
          {variant !== "chat" && (
            <div className="shrink-0 border-b border-stone-100 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-stone-900">گفت‌وگو و نتایج</h3>
                {!chatComposable && (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                    فقط نمایش
                  </span>
                )}
              </div>
              {chatComposable && caps.templates_enabled && (
                <div className="mt-2">
                  <TemplateQuickPicker
                    templates={templates.length ? templates : agent.templates ?? []}
                    onSelect={(body) => setChatSeed(body)}
                  />
                </div>
              )}
            </div>
          )}
          {variant === "chat" && chatComposable && caps.templates_enabled && (
            <div className="mb-2 shrink-0">
              <TemplateQuickPicker
                templates={templates.length ? templates : agent.templates ?? []}
                onSelect={(body) => setChatSeed(body)}
              />
            </div>
          )}
          <div className={variant === "chat" ? "min-h-0 flex-1" : "min-h-0 flex-1 p-2"}>
            <ChatPanel
              agent={agent}
              composable={chatComposable}
              threadId={chatThreadId ?? undefined}
              initialMessage={chatComposable ? chatSeed || initialMessage : undefined}
              messages={chatMessages}
              onMessagesChange={onChatMessagesChange}
              exchange={chatMessages ? undefined : chatExchange}
              onExchangeConsumed={onChatExchangeConsumed}
            />
          </div>
        </div>
      )}

      {showRunTools && caps.supervisor_enabled && (
        <div className="shrink-0">
          <SupervisorGraph agentId={agent.id} lastRoute={null} />
        </div>
      )}

      {showRunTools && caps.actions_enabled && (
        <details
          className="shrink-0 rounded-2xl border border-stone-200/90 bg-white shadow-card"
          open={variant === "run" || !chatComposable}
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-stone-900">
            اقدامات
          </summary>
          <div className="border-t border-stone-100 px-4 pb-4 pt-2">
            <WorkerActionGrid
              agent={agent}
              actions={actions.length ? actions : agent.actions ?? []}
              onRunStart={onActionRunStart}
              onChatExchange={(user, assistant) => onChatExchange?.({ user, assistant })}
            />
          </div>
        </details>
      )}

      {showRunTools && caps.file_upload_enabled && (
        <details
          className="shrink-0 rounded-2xl border border-stone-200/90 bg-white shadow-card"
          open={variant === "run" || (!chatComposable && caps.file_upload_enabled)}
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-stone-900">
            دریافت فایل ({files.length})
          </summary>
          <div className="border-t border-stone-100 px-4 pb-4 pt-2">
            <FileIntakePanel agentId={agent.id} filePolicy={filePolicy} />
            {filePolicy.require_files_to_invoke && (
              <p className="mt-2 text-xs text-stone-500">
                برای اجرا حداقل {filePolicy.min_files} فایل لازم است ({files.length} فعلی)
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
