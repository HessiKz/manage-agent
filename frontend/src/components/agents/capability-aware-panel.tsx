"use client";

import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
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
import { ChatWorkspaceFilesBanner } from "@/components/agents/chat-workspace-files-banner";
import { FileIntakePanel } from "@/components/agents/file-intake-panel";
import { FileInvokePanel } from "@/components/agents/file-invoke-panel";
import { SupervisorGraph } from "@/components/agents/supervisor-graph";
import { trainingAttachmentPolicy } from "@/lib/training-attachment-policy";
import { filePolicyForRole } from "@/lib/agent-presets";
import type { Agent } from "@/types";

export type CapabilityPanelVariant = "full" | "run" | "chat";
export type TrainingLayout = "stacked" | "split";

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
  /** Wizard training: enable chat, uploads, and all capability rails for calibration. */
  trainingMode?: boolean;
  trainingLayout?: TrainingLayout;
  /** Hide template picker when parent supplies sample prompts (training preview). */
  hideTemplatePicker?: boolean;
  chatAutomationPrefix?: string;
  /** `run` = actions/files only (execution tab). `chat` = chat tab only. */
  variant?: CapabilityPanelVariant;
};

function TrainingToolSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200/90 bg-white shadow-card">
      <div className="border-b border-stone-100 px-4 py-2.5">
        <h3 className="text-xs font-semibold text-stone-600">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

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
  trainingMode = false,
  trainingLayout = "stacked",
  hideTemplatePicker = false,
  chatAutomationPrefix,
  variant = "full",
}: Props) {
  const showChat = variant === "full" || variant === "chat";
  const showRunTools = variant === "full" || variant === "run";
  const splitTraining = trainingMode && trainingLayout === "split" && variant === "full";
  const caps = agent.capabilities ?? {
    chat_enabled: true,
    file_upload_enabled: false,
    actions_enabled: false,
    templates_enabled: false,
    can_call_agents: false,
    supervisor_enabled: false,
  };
  const filePolicy = trainingMode
    ? trainingAttachmentPolicy(agent)
    : filePolicyForRole(agent.file_policy, "input");

  const chatComposable = trainingMode || caps.chat_enabled;
  const showFileIntake = trainingMode || caps.file_upload_enabled;
  const showTemplatePicker =
    chatComposable &&
    (caps.templates_enabled || trainingMode) &&
    !hideTemplatePicker;
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
    enabled: showFileIntake,
  });

  const resolvedActions = actions.length ? actions : agent.actions ?? [];
  const hasRunnableActions = caps.actions_enabled && resolvedActions.length > 0;
  const showFileInvoke =
    showRunTools && showFileIntake && !trainingMode && !chatComposable && !hasRunnableActions;

  useQuery({
    queryKey: ["agent-link-graph", agent.id],
    queryFn: () => fetchAgentLinkGraph(agent.id),
    enabled: caps.supervisor_enabled,
  });

  const chatShell =
    variant === "chat"
      ? "flex h-full min-h-0 flex-col overflow-hidden"
      : splitTraining
        ? "flex min-h-[380px] flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-card"
        : trainingMode
          ? "flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-card"
          : "flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-card";

  const chatBlock = showChat ? (
    <div className={chatShell}>
      {variant !== "chat" && (
        <div className="shrink-0 border-b border-stone-100 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-stone-900">
              {splitTraining ? "گفتگو — اقدام اصلی" : "گفت‌وگو و نتایج"}
            </h3>
            {!chatComposable && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                فقط نمایش
              </span>
            )}
          </div>
          {showTemplatePicker && (
            <div className="mt-2">
              <TemplateQuickPicker
                templates={templates.length ? templates : agent.templates ?? []}
                onSelect={(body) => setChatSeed(body)}
              />
            </div>
          )}
        </div>
      )}
      {variant === "chat" && showTemplatePicker && (
        <div className="mb-2 shrink-0">
          <TemplateQuickPicker
            templates={templates.length ? templates : agent.templates ?? []}
            onSelect={(body) => setChatSeed(body)}
          />
        </div>
      )}
      <div className={variant === "chat" ? "min-h-0 flex-1" : "min-h-0 flex-1 p-2"}>
        <ChatWorkspaceFilesBanner
          agentId={agent.id}
          enabled={!trainingMode && (showFileIntake || files.length > 0)}
        />
        <ChatPanel
          agent={agent}
          composable={chatComposable}
          threadId={chatThreadId ?? undefined}
          initialMessage={chatComposable ? chatSeed || initialMessage : undefined}
          messages={chatMessages}
          onMessagesChange={onChatMessagesChange}
          exchange={chatMessages ? undefined : chatExchange}
          onExchangeConsumed={onChatExchangeConsumed}
          automationPrefix={chatAutomationPrefix}
          fileAttachment={
            trainingMode && showFileIntake
              ? {
                  agentId: agent.id,
                  policy: filePolicy,
                  supportId: "training-file-attach",
                }
              : undefined
          }
        />
      </div>
    </div>
  ) : null;

  const supervisorBlock =
    showRunTools && caps.supervisor_enabled ? (
      splitTraining ? (
        <TrainingToolSection title="اگر سرپرست است — مسیر زیرایجنت را ببینید">
          <SupervisorGraph agentId={agent.id} lastRoute={null} />
        </TrainingToolSection>
      ) : (
        <div className="shrink-0">
          <SupervisorGraph agentId={agent.id} lastRoute={null} />
        </div>
      )
    ) : null;

  const actionsBlock =
    showRunTools && caps.actions_enabled ? (
      splitTraining ? (
        <TrainingToolSection title="اگر اقدام دارد — اینجا اجرا کنید">
          <WorkerActionGrid
            agent={agent}
            actions={resolvedActions}
            onRunStart={onActionRunStart}
            onChatExchange={(user, assistant) => onChatExchange?.({ user, assistant })}
          />
        </TrainingToolSection>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-stone-200/90 bg-white shadow-card">
          <div className="border-b border-stone-100 px-4 py-3">
            <h3 className="text-sm font-bold text-stone-900">اقدامات</h3>
          </div>
          <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
            <WorkerActionGrid
              agent={agent}
              actions={resolvedActions}
              onRunStart={onActionRunStart}
              onChatExchange={(user, assistant) => onChatExchange?.({ user, assistant })}
            />
          </div>
        </div>
      )
    ) : null;

  const fileBlock =
    showRunTools && showFileIntake && !trainingMode ? (
      showFileInvoke ? (
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-stone-200/90 bg-white shadow-card">
          <div className="border-b border-stone-100 px-4 py-3">
            <h3 className="text-sm font-bold text-stone-900">دریافت فایل ({files.length})</h3>
          </div>
          <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
            <FileIntakePanel agentId={agent.id} filePolicy={filePolicy} />
            <FileInvokePanel
              agent={agent}
              filePolicy={filePolicy}
              fileCount={files.length}
              onRunStart={onActionRunStart}
              onChatExchange={(user, assistant) => onChatExchange?.({ user, assistant })}
            />
          </div>
        </div>
      ) : (
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
      )
    ) : null;

  const runToolsColumn = (
    <div className="flex flex-col gap-3">
      {supervisorBlock}
      {actionsBlock}
      {fileBlock}
    </div>
  );

  if (splitTraining) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <div className="min-h-0">{chatBlock}</div>
        {runToolsColumn}
      </div>
    );
  }

  return (
    <div
      className={
        variant === "chat"
          ? "flex h-full min-h-0 flex-col gap-3"
          : variant === "run"
            ? "flex min-h-[280px] flex-col gap-3"
            : "flex h-full min-h-0 flex-col gap-3"
      }
    >
      {chatBlock}
      {supervisorBlock}
      {actionsBlock}
      {fileBlock}
    </div>
  );
}