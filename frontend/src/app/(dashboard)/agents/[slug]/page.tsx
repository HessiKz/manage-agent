"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PanelTransition } from "@/components/motion/transitions";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { AgentChatTabPanel } from "@/components/agents/agent-chat-tab-panel";
import { AgentExecutionPanel } from "@/components/agents/agent-execution-panel";
import { AgentOverviewPanel } from "@/components/agents/agent-overview-panel";
import type { ChatExchange, ChatMessage } from "@/components/agents/chat-panel";
import { KIND_LABELS } from "@/lib/agent-presets";
import {
  appendPendingUserAction,
  finalizePendingExchange,
} from "@/lib/chat-messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { fetchAgentActivity, fetchAgentBySlug, fetchConversation, fetchMe } from "@/lib/api";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import { parseApiBindings } from "@/lib/agent-presets";
import { ApiBindingsSummary } from "@/components/agents/api-bindings-summary";
import { deptLabel, statusLabel } from "@/lib/utils";

type AgentTab = "execute" | "chat" | "overview" | "runs" | "settings";

const TAB_ORDER: Record<AgentTab, number> = {
  execute: 0,
  chat: 1,
  overview: 2,
  runs: 3,
  settings: 4,
};

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q");
  const conversationId = searchParams.get("conversation");

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", slug],
    queryFn: () => fetchAgentBySlug(slug),
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [resumeLabel, setResumeLabel] = useState<string | null>(null);
  const [resumeStartedAt, setResumeStartedAt] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [tab, setTab] = useState<AgentTab>(() => (conversationId ? "chat" : "execute"));

  const { data: activity = [] } = useQuery({
    queryKey: ["activity", agent?.id],
    queryFn: () => fetchAgentActivity(agent!.id),
    enabled: !!agent?.id,
  });

  const prevTabIndex = useRef(0);
  const panelDirection =
    TAB_ORDER[tab] >= prevTabIndex.current ? ("forward" as const) : ("backward" as const);

  const pushToChat = useCallback((exchange: ChatExchange) => {
    setChatMessages((m) => finalizePendingExchange(m, exchange));
    setTab("chat");
  }, []);

  const onActionRunStart = useCallback((userLine: string) => {
    setChatMessages((m) => appendPendingUserAction(m, userLine));
    setTab("chat");
  }, []);

  useEffect(() => {
    prevTabIndex.current = TAB_ORDER[tab];
  }, [tab]);

  useEffect(() => {
    if (initialQ && !conversationId) setTab("chat");
  }, [initialQ, conversationId]);

  useEffect(() => {
    if (!conversationId || !agent?.id) {
      setResumeLoading(false);
      return;
    }

    let cancelled = false;
    setResumeLoading(true);
    setResumeError(null);
    setTab("chat");

    (async () => {
      try {
        const detail = await fetchConversation(conversationId);
        if (cancelled) return;
        if (detail.agent_slug !== slug) {
          setResumeError("این گفت‌وگو متعلق به ایجنت دیگری است.");
          return;
        }
        const msgs: ChatMessage[] = detail.messages.map((m) => ({
          role: m.role,
          content:
            m.role === "assistant" ? formatAssistantOutput(m.content) : m.content,
        }));
        setChatMessages(msgs);
        setChatThreadId(detail.thread_id);
        setResumeLabel("ادامه گفت‌وگو");
        setResumeStartedAt(detail.started_at ?? null);
      } catch {
        if (!cancelled) {
          setResumeError("بارگذاری گفت‌وگو ممکن نشد.");
          setResumeLabel(null);
          setResumeStartedAt(null);
          setChatMessages([]);
          setChatThreadId(null);
        }
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, agent?.id, slug]);

  if (isLoading || !agent) {
    return <div className="p-6 text-stone-500">در حال بارگذاری ایجنت…</div>;
  }

  return (
    <div className="space-y-4 p-6">
      <Stagger initial={false} className="space-y-4" delayChildren={0.03} staggerChildren={0.05}>
        <StaggerItem variant="popIn">
          <Card>
            <CardBody className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-stone-500">
                  فضای کار / {deptLabel(agent.department)} / {agent.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-stone-900">{agent.name}</h1>
                  <Badge variant="muted">v۱.۴ · آنلاین</Badge>
                  <Badge variant={agent.status === "active" ? "success" : "muted"}>
                    {statusLabel(agent.status)}
                  </Badge>
                  {agent.kind && (
                    <Badge variant="muted">{KIND_LABELS[agent.kind] ?? agent.kind}</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-stone-500">{agent.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={tab === "execute" ? "primary" : "secondary"}
                  onClick={() => setTab("execute")}
                >
                  اجرا و راهنما
                </Button>
                <Button
                  variant={tab === "chat" ? "primary" : "secondary"}
                  onClick={() => setTab("chat")}
                >
                  گفت‌وگو
                </Button>
                <Button
                  variant={tab === "overview" ? "primary" : "secondary"}
                  onClick={() => setTab("overview")}
                >
                  پنل ایجنت
                </Button>
                <Button
                  variant={tab === "runs" ? "primary" : "secondary"}
                  onClick={() => setTab("runs")}
                >
                  تاریخچه اجرا
                </Button>
                <Button
                  variant={tab === "settings" ? "primary" : "secondary"}
                  onClick={() => setTab("settings")}
                >
                  تنظیمات
                </Button>
              </div>
            </CardBody>
          </Card>
        </StaggerItem>

        <PanelTransition transitionKey={tab} direction={panelDirection}>
          {tab === "execute" && (
            <AgentExecutionPanel
              agent={agent}
              onChatExchange={pushToChat}
              onActionRunStart={onActionRunStart}
              showAdminTest={!!me?.is_superuser}
            />
          )}

          {tab === "chat" && (
            <>
              {resumeLoading && (
                <p className="text-sm text-stone-500">در حال بارگذاری گفت‌وگو…</p>
              )}
              {resumeError && (
                <p className="text-sm text-accent-red">{resumeError}</p>
              )}
              <AgentChatTabPanel
                agent={agent}
                initialMessage={conversationId ? null : initialQ}
                chatMessages={chatMessages}
                onChatMessagesChange={setChatMessages}
                onChatExchange={pushToChat}
                onActionRunStart={onActionRunStart}
                chatThreadId={chatThreadId}
                resumeLabel={resumeLabel}
                resumeStartedAt={resumeStartedAt}
              />
            </>
          )}

          {tab === "overview" && <AgentOverviewPanel agentId={agent.id} />}

          {tab === "runs" && (
            <Card>
              <CardHeader>
                <h3 className="font-bold">تاریخچه اجرا · {agent.name}</h3>
              </CardHeader>
              <CardBody className="space-y-2">
                {activity.slice(0, 20).map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-stone-100 bg-stone-50/50 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold text-stone-800">{a.action}</p>
                      {a.input_text && (
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => {
                            router.push(`/agents/${slug}?conversation=${a.id}`);
                          }}
                        >
                          ادامه در گفت‌وگو
                        </Button>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-stone-500">{a.input_text}</p>
                    {a.output_text && (
                      <p className="mt-1 line-clamp-2 text-xs text-stone-600">{a.output_text}</p>
                    )}
                  </div>
                ))}
                {activity.length === 0 && (
                  <p className="text-sm text-stone-400">هنوز اجرایی برای این ایجنت ثبت نشده</p>
                )}
              </CardBody>
            </Card>
          )}

          {tab === "settings" && (
            <Card>
              <CardHeader>
                <h3 className="font-bold">تنظیمات · {agent.name}</h3>
              </CardHeader>
              <CardBody className="space-y-3 text-sm text-stone-600">
                <p>
                  <span className="text-stone-500">شناسه:</span> {agent.slug}
                </p>
                <p>
                  <span className="text-stone-500">نوع:</span> {agent.kind}
                </p>
                <p>
                  <span className="text-stone-500">مدل:</span> {agent.model_provider} /{" "}
                  {agent.model_name}
                </p>
                <p>
                  <span className="text-stone-500">ابزارها:</span>{" "}
                  {agent.tool_names.join("، ") || "—"}
                </p>
                {agent.capabilities?.external_apis_enabled && (
                  <div>
                    <p className="mb-2 font-semibold text-stone-700">APIهای متصل</p>
                    <ApiBindingsSummary bindings={parseApiBindings(agent.config_json)} />
                  </div>
                )}
                <p className="text-xs text-stone-400">
                  تنظیمات پیشرفته در ویزارد «ایجنت جدید» قابل تغییر است.
                </p>
              </CardBody>
            </Card>
          )}
        </PanelTransition>
      </Stagger>
    </div>
  );
}
