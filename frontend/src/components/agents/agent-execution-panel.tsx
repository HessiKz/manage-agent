"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Download, Play, Wrench } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { CapabilityAwarePanel } from "@/components/agents/capability-aware-panel";
import type { ChatExchange, ChatMessage } from "@/components/agents/chat-panel";
import { ExecutionResultPanel } from "@/components/agents/execution-result-panel";
import { AgentTestPanel } from "@/components/agents/agent-test-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAgentExecution } from "@/lib/api";
import type { Agent } from "@/types";

type Props = {
  agent: Agent;
  chatMessages?: ChatMessage[];
  onChatMessagesChange?: Dispatch<SetStateAction<ChatMessage[]>>;
  onChatExchange?: (exchange: ChatExchange) => void;
  onActionRunStart?: (userLine: string) => void;
  showAdminTest?: boolean;
};

export function AgentExecutionPanel({
  agent,
  chatMessages,
  onChatMessagesChange,
  onChatExchange,
  onActionRunStart,
  showAdminTest = false,
}: Props) {
  const chatEnabled = agent.capabilities?.chat_enabled === true;
  const { data: guide, isLoading } = useQuery({
    queryKey: ["agent-execution", agent.id],
    queryFn: () => fetchAgentExecution(agent.id),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-4">
      {isLoading || !guide ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
      <Card className="border-brand-200/80 bg-gradient-to-l from-brand-50/80 to-white">
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Badge variant="default">{guide.domain_label}</Badge>
            <Badge variant="muted">{agent.slug}</Badge>
          </div>
          <h2 className="text-xl font-bold text-stone-900">{guide.headline}</h2>
          <p className="text-sm leading-relaxed text-stone-600">{guide.summary}</p>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader className="flex flex-row items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-600" />
            <h3 className="font-bold">این ایجنت چه می‌کند</h3>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2 text-sm text-stone-600">
              {guide.responsibilities.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card className="h-full">
          <CardHeader className="flex flex-row items-center gap-2">
            <Play className="h-5 w-5 text-brand-600" />
            <h3 className="font-bold">نحوه اجرا</h3>
          </CardHeader>
          <CardBody>
            <ol className="list-inside list-decimal space-y-2 text-sm text-stone-600">
              {guide.how_to_steps.map((step, i) => (
                <li key={i} className="leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      {(guide.inputs.length > 0 || guide.outputs.length > 0 || guide.tools.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Wrench className="h-5 w-5 text-brand-600" />
            <h3 className="font-bold">ورودی، خروجی و ابزارها</h3>
          </CardHeader>
          <CardBody className="grid gap-4 text-sm sm:grid-cols-3">
            {guide.inputs.length > 0 && (
              <div>
                <p className="mb-2 font-semibold text-stone-800">ورودی</p>
                <ul className="list-disc pr-4 text-stone-600">
                  {guide.inputs.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {guide.outputs.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1 font-semibold text-stone-800">
                  <Download className="h-3.5 w-3.5" />
                  خروجی
                </p>
                <ul className="list-disc pr-4 text-stone-600">
                  {guide.outputs.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {guide.tools.length > 0 && (
              <div>
                <p className="mb-2 font-semibold text-stone-800">ابزارها</p>
                <div className="flex flex-wrap gap-1">
                  {guide.tools.map((t) => (
                    <Badge key={t} variant="muted">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {(guide.actions.length > 0 || guide.templates.length > 0) && (
        <Card>
          <CardHeader>
            <h3 className="font-bold">قالب‌های این ایجنت</h3>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            {guide.templates.length > 0 && (
              <ul className="space-y-1 text-stone-600">
                {guide.templates.map((t) => (
                  <li key={t.slug}>
                    <span className="font-medium text-stone-800">{t.label}:</span>{" "}
                    {t.body.slice(0, 80)}
                    {t.body.length > 80 ? "…" : ""}
                  </li>
                ))}
              </ul>
            )}
            {guide.actions.length > 0 && guide.templates.length === 0 && (
              <p className="text-stone-500">
                {guide.actions.length} اقدام — از منوی کشویی بخش «اجرای ایجنت» در پایین انتخاب
                کنید.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {guide.tips.length > 0 && (
        <p className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-xs text-brand-900">
          {guide.tips.map((t) => (
            <span key={t} className="block">
              {t}
            </span>
          ))}
        </p>
      )}
        </>
      )}

      {showAdminTest && guide && (
        <AgentTestPanel
          agent={agent}
          onChatExchange={(user, assistant) => onChatExchange?.({ user, assistant })}
        />
      )}

      <Card className="overflow-hidden border-brand-200/60">
        <CardHeader className="border-b border-surface-border bg-surface-muted/40">
          <h3 className="font-bold text-stone-900">اجرای ایجنت</h3>
          <p className="text-xs text-stone-500">
            {chatEnabled
              ? "اقدام را انتخاب کنید، ورودی‌ها را پر کنید و «اجرا» را بزنید — نتیجه در تب «گفت‌وگو» نمایش داده می‌شود"
              : "اقدام را انتخاب کنید، ورودی‌ها را پر کنید و «اجرا» را در پایین بزنید — نتیجه در بخش «نتایج اجرا» پایین همین صفحه نمایش داده می‌شود"}
          </p>
        </CardHeader>
        <CardBody className="flex min-h-[320px] flex-col p-3">
          <CapabilityAwarePanel
            agent={agent}
            variant="run"
            onChatExchange={onChatExchange}
            onActionRunStart={onActionRunStart}
          />
        </CardBody>
      </Card>

      {!chatEnabled && (
        <Card className="overflow-hidden border-stone-200/90">
          <CardHeader className="border-b border-surface-border bg-surface-muted/40">
            <h3 className="font-bold text-stone-900">خروجی اجرا</h3>
            <p className="text-xs text-stone-500">
              فقط نتیجهٔ آخرین اجرا — بدون گفت‌وگو
            </p>
          </CardHeader>
          <CardBody className="p-3">
            <ExecutionResultPanel messages={chatMessages} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
