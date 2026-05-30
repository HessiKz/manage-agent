"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { AgentToolPicker } from "@/components/agents/agent-tool-picker";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import {
  fetchAgentBySlug,
  fetchTools,
  startAgentValidation,
  updateAgent,
} from "@/lib/api";
import { appAlert } from "@/lib/app-dialog";
import { deptLabel, statusLabel } from "@/lib/utils";
import type { Agent } from "@/types";

type ValidationFailure = {
  phase: string;
  message: string;
  fixable_in_admin?: boolean;
};

function parseFailures(agent: Agent | undefined): ValidationFailure[] {
  const raw = agent?.config_json?.validation;
  if (!raw || typeof raw !== "object") return [];
  const failures = (raw as { failures?: ValidationFailure[] }).failures;
  return Array.isArray(failures) ? failures : [];
}

type Props = {
  slug: string;
};

export function AgentFixPanel({ slug }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [retesting, setRetesting] = useState(false);

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", slug],
    queryFn: () => fetchAgentBySlug(slug),
  });
  const { data: tools = [] } = useQuery({ queryKey: ["tools"], queryFn: fetchTools });

  const failures = useMemo(() => parseFailures(agent), [agent]);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [toolNames, setToolNames] = useState<string[] | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);

  const prompt = systemPrompt ?? agent?.system_prompt ?? "";
  const toolsSelected = toolNames ?? agent?.tool_names ?? [];
  const model = modelName ?? agent?.model_name ?? "";

  async function persistChanges() {
    if (!agent) return;
    await updateAgent(agent.id, {
      system_prompt: prompt,
      tool_names: toolsSelected,
      model_name: model,
      status: "deploying" as never,
    });
    await qc.invalidateQueries({ queryKey: ["agent", slug] });
    await qc.invalidateQueries({ queryKey: ["agents-pipeline"] });
  }

  async function saveChanges() {
    setSaving(true);
    try {
      await persistChanges();
    } finally {
      setSaving(false);
    }
  }

  async function saveAndRetest() {
    if (!agent) return;
    setRetesting(true);
    try {
      await persistChanges();
      await startAgentValidation(agent.id);
      const qs = new URLSearchParams({ slug: agent.slug, name: agent.name });
      router.push(`/agents/create/testing?${qs.toString()}`);
    } catch {
      await appAlert({
        title: "خطا",
        message: "ذخیره یا شروع مجدد تست ممکن نشد.",
        tone: "danger",
      });
    } finally {
      setRetesting(false);
    }
  }

  if (isLoading || !agent) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-stone-500">
        <Loader2 className="ml-2 h-5 w-5 animate-spin" />
        در حال بارگذاری…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Stagger className="space-y-6">
        <StaggerItem variant="slideUp">
          <div>
            <Link
              href="/admin"
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              ← بازگشت به پنل ادمین
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-stone-900">اصلاح ایجنت</h1>
            <p className="mt-1 text-sm text-stone-500">
              {agent.name} · {deptLabel(agent.department)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={agent.status === "error" ? "danger" : "warning"}>
                {statusLabel(agent.status)}
              </Badge>
              <Badge variant="muted">{agent.slug}</Badge>
            </div>
          </div>
        </StaggerItem>

        {failures.length > 0 && (
          <StaggerItem variant="scaleIn">
            <Card className="border-accent-red/30 bg-accent-red/5">
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                <AlertTriangle className="h-5 w-5 text-accent-red" />
                <h3 className="font-bold text-stone-900">خطاهای تست خودکار</h3>
              </CardHeader>
              <CardBody className="space-y-2 pt-0">
                {failures.map((f, i) => (
                  <div
                    key={`${f.phase}-${i}`}
                    className="rounded-xl border border-accent-red/20 bg-white px-3 py-2 text-sm"
                  >
                    <p className="font-semibold text-stone-900">{f.phase}</p>
                    <p className="mt-0.5 leading-relaxed text-stone-600">{f.message}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          </StaggerItem>
        )}

        {failures.length === 0 && agent.status === "error" && (
          <StaggerItem variant="fadeIn">
            <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
              جزئیات خطا در دسترس نیست — تنظیمات را بازبینی کنید و دوباره تست بگیرید.
            </p>
          </StaggerItem>
        )}

        <StaggerItem variant="slideUp">
          <Card>
            <CardHeader>
              <h3 className="font-bold">تنظیمات قابل اصلاح</h3>
              <p className="mt-1 text-xs font-normal text-stone-500">
                پس از تغییر، «ذخیره و تست مجدد» را بزنید تا ایجنت دوباره بررسی شود.
              </p>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  دستورالعمل ایجنت
                </label>
                <Textarea
                  rows={5}
                  value={prompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="دستورالعمل را به فارسی بنویسید…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  نام مدل
                </label>
                <input
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                  value={model}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="auto"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-stone-700">
                  امکانات کمکی
                </label>
                <AgentToolPicker
                  tools={tools}
                  selected={toolsSelected}
                  onChange={setToolNames}
                  compact
                  wizardOnly
                />
              </div>
            </CardBody>
          </Card>
        </StaggerItem>

        <StaggerItem variant="slideUp">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={saving || retesting}
              onClick={saveAndRetest}
            >
              {retesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              ذخیره و تست مجدد
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={saving || retesting}
              onClick={saveChanges}
            >
              {saving ? "در حال ذخیره…" : "فقط ذخیره"}
            </Button>
          </div>
          <Link href={`/agents/${slug}`} className="mt-3 block">
            <Button variant="ghost" className="w-full">
              <ArrowRight className="h-4 w-4" />
              مشاهده پنل ایجنت (بدون اصلاح)
            </Button>
          </Link>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
