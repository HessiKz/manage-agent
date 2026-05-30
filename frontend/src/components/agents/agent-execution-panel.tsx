"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Download, Play, Wrench } from "lucide-react";
import { CapabilityAwarePanel } from "@/components/agents/capability-aware-panel";
import type { ChatExchange } from "@/components/agents/chat-panel";
import { AgentTestPanel } from "@/components/agents/agent-test-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAgentExecution } from "@/lib/api";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { Agent } from "@/types";

type Props = {
  agent: Agent;
  onChatExchange?: (exchange: ChatExchange) => void;
  onActionRunStart?: (userLine: string) => void;
  showAdminTest?: boolean;
};

export function AgentExecutionPanel({
  agent,
  onChatExchange,
  onActionRunStart,
  showAdminTest = false,
}: Props) {
  const { data: guide, isLoading } = useQuery({
    queryKey: ["agent-execution", agent.id],
    queryFn: () => fetchAgentExecution(agent.id),
  });

  if (isLoading || !guide) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <Stagger initial={false} className="space-y-4" delayChildren={0.03} staggerChildren={0.05}>
      <StaggerItem variant="slideUp">
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
      </StaggerItem>

      <div className="grid gap-4 lg:grid-cols-2">
        <StaggerItem variant="scaleIn">
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
        </StaggerItem>

        <StaggerItem variant="scaleIn">
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
        </StaggerItem>
      </div>

      {(guide.inputs.length > 0 || guide.outputs.length > 0 || guide.tools.length > 0) && (
        <StaggerItem variant="slideUp">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Wrench className="h-5 w-5 text-brand-600" />
              <h3 className="font-bold">ورودی، خروجی و ابزارها</h3>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-3 text-sm">
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
        </StaggerItem>
      )}

      {(guide.actions.length > 0 || guide.templates.length > 0) && (
        <StaggerItem variant="fadeIn">
          <Card>
            <CardHeader>
              <h3 className="font-bold">اقدامات و قالب‌های این ایجنت</h3>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              {guide.actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {guide.actions.map((a) => (
                    <span
                      key={a.slug}
                      className="rounded-xl border border-surface-border bg-surface-muted/60 px-3 py-2"
                      title={a.description}
                    >
                      <span className="font-semibold text-stone-800">{a.label}</span>
                      <span className="mr-2 text-xs text-stone-400">({a.slug})</span>
                    </span>
                  ))}
                </div>
              )}
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
            </CardBody>
          </Card>
        </StaggerItem>
      )}

      {guide.tips.length > 0 && (
        <StaggerItem variant="fadeIn">
          <p className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-xs text-brand-900">
            {guide.tips.map((t) => (
              <span key={t} className="block">
                {t}
              </span>
            ))}
          </p>
        </StaggerItem>
      )}

      {showAdminTest && (
        <StaggerItem variant="slideUp">
          <AgentTestPanel
            agent={agent}
            onChatExchange={(user, assistant) => onChatExchange?.({ user, assistant })}
          />
        </StaggerItem>
      )}

      <StaggerItem variant="slideUp">
        <Card className="overflow-hidden border-brand-200/60">
          <CardHeader className="border-b border-surface-border bg-surface-muted/40">
            <h3 className="font-bold text-stone-900">اجرای ایجنت</h3>
            <p className="text-xs text-stone-500">
              فایل و اقدام را اینجا اجرا کنید — نتیجه در تب «گفت‌وگو» نمایش داده می‌شود
            </p>
          </CardHeader>
          <CardBody className="p-3">
            <CapabilityAwarePanel
              agent={agent}
              variant="run"
              onChatExchange={onChatExchange}
              onActionRunStart={onActionRunStart}
            />
          </CardBody>
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
