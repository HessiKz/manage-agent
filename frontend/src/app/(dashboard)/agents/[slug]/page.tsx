"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelTransition } from "@/components/motion/transitions";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { AgentChatTabPanel } from "@/components/agents/agent-chat-tab-panel";
import { AgentExecutionPanel } from "@/components/agents/agent-execution-panel";
import { AgentOverviewPanel } from "@/components/agents/agent-overview-panel";
import { AgentKnowledgePanel } from "@/components/agents/agent-knowledge-panel";
import type { ChatExchange, ChatMessage } from "@/components/agents/chat-panel";
import { KIND_LABELS } from "@/lib/agent-presets";
import {
  appendPendingUserAction,
  finalizePendingExchange,
} from "@/lib/chat-messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { fetchAgentActivity, fetchAgentBySlug, fetchAgentExecution, fetchConversation, fetchMe } from "@/lib/api";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import { plainTextOutputPreview, plainTextUserPreview } from "@/lib/plain-text-preview";
import { parseApiBindings } from "@/lib/agent-presets";
import { ApiBindingsSummary } from "@/components/agents/api-bindings-summary";
import { agentInCreationWizard } from "@/lib/agent-validation";
import { deptLabel, statusLabel } from "@/lib/utils";
import {
  OVERVIEW_PANEL_URL_KEYS,
  useUrlParams,
} from "@/lib/url-search-params";

type AgentTab = "execute" | "chat" | "overview" | "knowledge" | "runs" | "settings";

const TAB_ORDER: Record<AgentTab, number> = {
  execute: 0,
  chat: 1,
  overview: 2,
  knowledge: 3,
  runs: 4,
  settings: 5,
};

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { replaceParams } = useUrlParams();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q");
  const conversationId = searchParams.get("conversation");
  const tabParam = searchParams.get("tab");
  const draftPreview = searchParams.get("draft") === "1";
  const openWidgetBuilder = searchParams.get("open_widget_builder") === "1";
  const autoGenerateWidget = searchParams.get("auto_generate") === "1";
  const widgetTypeParam = searchParams.get("widget_type");
  const widgetPrompt = searchParams.get("widget_prompt");
  const highlightWidget = searchParams.get("highlight_widget");

  const tabFromUrl = (value: string | null): AgentTab | null => {
    if (
      value === "execute" ||
      value === "chat" ||
      value === "overview" ||
      value === "knowledge" ||
      value === "runs" ||
      value === "settings"
    ) {
      return value;
    }
    return null;
  };

  const { data: agent, isLoading, isError } = useQuery({
    queryKey: ["agent", slug],
    queryFn: () => fetchAgentBySlug(slug),
    retry: false,
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
  const [tab, setTab] = useState<AgentTab>(() => {
    if (conversationId) return "chat";
    return tabFromUrl(tabParam) ?? "execute";
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["activity", agent?.id],
    queryFn: () => fetchAgentActivity(agent!.id),
    enabled: !!agent?.id,
  });

  useEffect(() => {
    if (!agent?.id) return;
    void qc.prefetchQuery({
      queryKey: ["agent-execution", agent.id],
      queryFn: () => fetchAgentExecution(agent.id),
      staleTime: 5 * 60_000,
    });
  }, [agent?.id, qc]);

  const prevTabIndex = useRef(0);
  const panelDirection =
    TAB_ORDER[tab] >= prevTabIndex.current ? ("forward" as const) : ("backward" as const);

  const chatEnabled = agent?.capabilities?.chat_enabled === true;

  const selectTab = useCallback(
    (next: AgentTab) => {
      setTab(next);
      if (next === "overview") {
        replaceParams({ set: { tab: "overview" } });
        return;
      }
      if (next === "execute") {
        replaceParams({ delete: ["tab", ...OVERVIEW_PANEL_URL_KEYS] });
        return;
      }
      replaceParams({
        set: { tab: next },
        delete: [...OVERVIEW_PANEL_URL_KEYS],
      });
    },
    [replaceParams]
  );

  const pushToChat = useCallback(
    (exchange: ChatExchange) => {
      setChatMessages((m) => finalizePendingExchange(m, exchange));
      if (chatEnabled) selectTab("chat");
    },
    [chatEnabled, selectTab]
  );

  const onActionRunStart = useCallback(
    (userLine: string) => {
      setChatMessages((m) => appendPendingUserAction(m, userLine));
      if (chatEnabled) selectTab("chat");
    },
    [chatEnabled, selectTab]
  );

  useEffect(() => {
    const fromUrl = tabFromUrl(tabParam);
    if (fromUrl) setTab(fromUrl);
  }, [tabParam]);

  useEffect(() => {
    prevTabIndex.current = TAB_ORDER[tab];
    const main = document.getElementById("ma-main-scroll");
    if (main) {
      main.scrollTop = 0;
    }
  }, [tab]);

  useEffect(() => {
    if (initialQ && chatEnabled && !conversationId) selectTab("chat");
  }, [initialQ, conversationId, chatEnabled, selectTab]);

  useEffect(() => {
    if (!chatEnabled && tab === "chat") selectTab("execute");
  }, [chatEnabled, tab, selectTab]);

  useEffect(() => {
    if (!agent || !agentInCreationWizard(agent)) return;
    const params = new URLSearchParams({ slug: agent.slug, name: agent.name });
    if (draftPreview) params.set("draft", "1");
    if (highlightWidget) params.set("highlight_widget", highlightWidget);
    router.replace(`/agents/create?${params.toString()}`);
  }, [agent, draftPreview, highlightWidget, router]);

  useEffect(() => {
    if (!conversationId || !agent?.id) {
      setResumeLoading(false);
      return;
    }

    let cancelled = false;
    setResumeLoading(true);
    setResumeError(null);
    if (chatEnabled) setTab("chat");
    else setTab("execute");

    (async () => {
      try {
        const detail = await fetchConversation(conversationId);
        if (cancelled) return;
        if (detail.agent_slug !== slug) {
          setResumeError("این گفت‌وگو متعلق به ایجنت دیگری است.");
          return;
        }
        if (!chatEnabled) {
          setResumeError("این ایجنت گفت‌وگو ندارد — فقط نتیجه در تب «اجرا و راهنما» نمایش داده می‌شود.");
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
  }, [conversationId, agent?.id, slug, chatEnabled]);

  if (isLoading) {
    return <div className="page-padding text-stone-500">در حال بارگذاری ایجنت…</div>;
  }

  if (isError || !agent) {
    return (
      <div className="page-padding space-y-4">
        <p className="text-sm text-accent-red">ایجنت «{slug}» پیدا نشد.</p>
        <Button variant="secondary" onClick={() => router.push("/agents")}>
          بازگشت به فهرست ایجنت‌ها
        </Button>
      </div>
    );
  }

  return (
    <div className="page-padding space-y-4">
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
                  <Badge variant={agent.status === "active" ? "success" : "muted"}>
                    {statusLabel(agent.status)}
                  </Badge>
                  {agent.kind && (
                    <Badge variant="muted">{KIND_LABELS[agent.kind] ?? agent.kind}</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-stone-500">{agent.description}</p>
              </div>

              <div
                className="touch-scroll-x flex w-full gap-2 sm:w-auto sm:flex-wrap"
                data-ma-guide="agent-tabs"
              >
                <Button
                  variant={tab === "execute" ? "primary" : "secondary"}
                  onClick={() => selectTab("execute")}
                  data-ma-guide="agent-tab-execute"
                  className="shrink-0 whitespace-nowrap"
                >
                  اجرا و راهنما
                </Button>
                {chatEnabled && (
                  <Button
                    variant={tab === "chat" ? "primary" : "secondary"}
                    onClick={() => selectTab("chat")}
                    data-ma-guide="agent-tab-chat"
                    className="shrink-0 whitespace-nowrap"
                  >
                    گفت‌وگو
                  </Button>
                )}
                <Button
                  variant={tab === "overview" ? "primary" : "secondary"}
                  onClick={() => selectTab("overview")}
                  data-ma-guide="agent-tab-overview"
                  className="shrink-0 whitespace-nowrap"
                >
                  پنل ایجنت
                </Button>
                <Button
                  variant={tab === "knowledge" ? "primary" : "secondary"}
                  onClick={() => selectTab("knowledge")}
                  data-ma-guide="agent-tab-knowledge"
                  className="shrink-0 whitespace-nowrap"
                >
                  پایگاه دانش
                </Button>
                <Button
                  variant={tab === "runs" ? "primary" : "secondary"}
                  onClick={() => selectTab("runs")}
                  className="shrink-0 whitespace-nowrap"
                >
                  تاریخچه اجرا
                </Button>
                <Button
                  variant={tab === "settings" ? "primary" : "secondary"}
                  onClick={() => selectTab("settings")}
                  className="shrink-0 whitespace-nowrap"
                >
                  تنظیمات
                </Button>
              </div>
            </CardBody>
          </Card>
        </StaggerItem>

        <PanelTransition transitionKey={tab} direction={panelDirection} preset="fade">
          {tab === "execute" && (
            <AgentExecutionPanel
              agent={agent}
              chatMessages={chatMessages}
              onChatMessagesChange={setChatMessages}
              onChatExchange={pushToChat}
              onActionRunStart={onActionRunStart}
              showAdminTest={!!me?.is_superuser}
            />
          )}

          {tab === "chat" && chatEnabled && (
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

          {tab === "overview" && (
            <AgentOverviewPanel
              agentId={agent.id}
              agent={agent}
              editable={!!me?.is_superuser}
              showAdminTest={!!me?.is_superuser}
              draftPreview={draftPreview}
              autoGenerateWidget={autoGenerateWidget}
              widgetBuilderType={widgetTypeParam ?? undefined}
              widgetPrompt={widgetPrompt}
              highlightWidget={highlightWidget}
              onOpenKnowledge={() => selectTab("knowledge")}
            />
          )}

          {tab === "knowledge" && <AgentKnowledgePanel agent={agent} />}

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
                      {a.input_text && chatEnabled && (
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
                      {a.output_text && !chatEnabled && (
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => {
                            setChatMessages([
                              { role: "user", content: a.input_text || a.action },
                              {
                                role: "assistant",
                                content: formatAssistantOutput(a.output_text),
                              },
                            ]);
                            setTab("execute");
                          }}
                        >
                          مشاهده نتیجه
                        </Button>
                      )}
                    </div>
                    {a.input_text && (
                      <p className="mt-0.5 truncate text-stone-500">
                        {plainTextUserPreview(a.input_text)}
                      </p>
                    )}
                    {a.output_text && (
                      <p className="mt-1 line-clamp-2 text-xs text-stone-600">
                        {plainTextOutputPreview(a.output_text)}
                      </p>
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
                  <span className="text-stone-500">نوع:</span>{" "}
                  {agent.kind ? KIND_LABELS[agent.kind] ?? agent.kind : "—"}
                </p>
                <p>
                  <span className="text-stone-500">مدل:</span>{" "}
                  {agent.model_provider} / {agent.model_name}
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
