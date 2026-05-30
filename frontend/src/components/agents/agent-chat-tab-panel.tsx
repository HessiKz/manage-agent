"use client";

import { MessageCircle } from "lucide-react";
import { CapabilityAwarePanel } from "@/components/agents/capability-aware-panel";
import type { ChatExchange, ChatMessage } from "@/components/agents/chat-panel";
import type { Dispatch, SetStateAction } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ClientDateTime } from "@/components/ui/client-date";
import type { Agent } from "@/types";

type Props = {
  agent: Agent;
  initialMessage?: string | null;
  chatMessages: ChatMessage[];
  onChatMessagesChange: Dispatch<SetStateAction<ChatMessage[]>>;
  onChatExchange?: (exchange: ChatExchange) => void;
  onActionRunStart?: (userLine: string) => void;
  chatThreadId?: string | null;
  resumeLabel?: string | null;
  resumeStartedAt?: string | null;
};

export function AgentChatTabPanel({
  agent,
  initialMessage,
  chatMessages,
  onChatMessagesChange,
  onChatExchange,
  onActionRunStart,
  chatThreadId,
  resumeLabel,
  resumeStartedAt,
}: Props) {
  const chatEnabled = agent.capabilities?.chat_enabled !== false;

  return (
    <Card className="overflow-hidden border-brand-200/60">
      <CardHeader className="border-b border-surface-border bg-surface-muted/40">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <MessageCircle className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="font-bold text-stone-900">گفت‌وگو با {agent.name}</h3>
            <p className="text-xs text-stone-500">
              {resumeLabel ? (
                <>
                  {resumeLabel}
                  {resumeStartedAt ? (
                    <>
                      {" · "}
                      <ClientDateTime iso={resumeStartedAt} />
                    </>
                  ) : null}
                </>
              ) : chatEnabled ? (
                "سؤال بپرسید — پاسخ و نتایج اجرا اینجا است"
              ) : (
                "گفت‌وگوی آزاد غیرفعال است — نتایج اقدامات از تب «اجرا و راهنما» اینجا می‌آید"
              )}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody className="min-h-[min(50vh,24rem)] p-3">
        <CapabilityAwarePanel
          agent={agent}
          variant="chat"
          initialMessage={initialMessage}
          chatMessages={chatMessages}
          onChatMessagesChange={onChatMessagesChange}
          onChatExchange={onChatExchange}
          onActionRunStart={onActionRunStart}
          chatThreadId={chatThreadId}
        />
      </CardBody>
    </Card>
  );
}
