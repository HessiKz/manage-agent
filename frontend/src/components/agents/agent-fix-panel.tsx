"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  AgentEditorForm,
  createEditorDraftFromAgent,
  validateAgentEditorDraft,
} from "@/components/agents/agent-editor-form";
import { AgentToolPicker } from "@/components/agents/agent-tool-picker";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import {
  fetchAgentBySlug,
  fetchAgentExecutionGuideStatus,
  fetchAgentPermissions,
  fetchMe,
  fetchTools,
  regenerateExecutionGuide,
  startAgentValidation,
  updateAgent,
  refreshAgentInstructions,
} from "@/lib/api";
import { appAlert } from "@/lib/app-dialog";
import type { AgentEditorDraft } from "@/lib/agent-editor-state";
import { persistAgentEditor } from "@/lib/agent-editor-persist";
import { handleApiError } from "@/lib/api-error-handler";
import { waitForExecutionGuide } from "@/lib/wait-for-execution-guide";
import { deptLabel, statusLabel } from "@/lib/utils";
import type { Agent } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

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

type EditPhase = "form" | "generating-guide" | "complete";

type Props = {
  slug: string;
  mode?: "fix" | "edit";
};

function FixModeForm({
  agent,
  saving,
  retesting,
  saveError,
  onSaveChanges,
  onSaveAndRetest,
}: {
  agent: Agent;
  saving: boolean;
  retesting: boolean;
  saveError: string | null;
  onSaveChanges: (payload: {
    system_prompt: string;
    tool_names: string[];
  }) => void;
  onSaveAndRetest: (payload: {
    system_prompt: string;
    tool_names: string[];
  }) => void;
}) {
  const { data: tools = [] } = useQuery({ queryKey: ["tools"], queryFn: fetchTools });
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [toolNames, setToolNames] = useState<string[] | null>(null);
  const failures = useMemo(() => parseFailures(agent), [agent]);

  const prompt = systemPrompt ?? agent?.system_prompt ?? "";
  const toolsSelected = toolNames ?? agent?.tool_names ?? [];

  return (
    <>
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
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <span className="text-stone-500">مدل ثابت:</span>{" "}
              <span className="font-mono font-semibold text-stone-900">claude-opus-4-8</span>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-stone-700">امکانات کمکی</label>
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

      {saveError && (
        <StaggerItem variant="fadeIn">
          <p className="rounded-xl border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-sm text-accent-red">
            {saveError}
          </p>
        </StaggerItem>
      )}

      <StaggerItem variant="slideUp">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            disabled={saving || retesting}
            onClick={() =>
              onSaveAndRetest({
                system_prompt: prompt.trim(),
                tool_names: toolsSelected,
              })
            }
          >
            {retesting ? (
              <LoadingSpinner />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            ذخیره و تست مجدد
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={saving || retesting}
            onClick={() =>
              onSaveChanges({
                system_prompt: prompt.trim(),
                tool_names: toolsSelected,
              })
            }
          >
            {saving ? "در حال ذخیره…" : "فقط ذخیره"}
          </Button>
        </div>
      </StaggerItem>
    </>
  );
}

export function AgentFixPanel({ slug, mode = "fix" }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [retesting, setRetesting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editPhase, setEditPhase] = useState<EditPhase>("form");
  const [guideSource, setGuideSource] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentEditorDraft | null>(null);
  const [refreshExecutionGuide, setRefreshExecutionGuide] = useState(true);
  const [initialPermissions, setInitialPermissions] = useState<AgentEditorDraft["permissions"]>([]);

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", slug],
    queryFn: () => fetchAgentBySlug(slug),
  });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  useEffect(() => {
    if (agent && mode === "edit") {
      void (async () => {
        const perms = await qc.fetchQuery({
          queryKey: ["agent-permissions"],
          queryFn: fetchAgentPermissions,
        });
        const permissionRows = (perms ?? []).filter((p) => p.agent_id === agent.id);
        setInitialPermissions(
          permissionRows.map((p) => ({
            user_id: p.user_id,
            can_invoke: p.can_invoke,
            can_configure: p.can_configure,
          }))
        );
        setDraft(createEditorDraftFromAgent(agent, permissionRows));
      })();
    }
  }, [agent, mode, qc]);

  async function persistFixChanges(payload: {
    system_prompt: string;
    tool_names: string[];
  }) {
    if (!agent) return null;
    const updated = await updateAgent(agent.id, {
      system_prompt: payload.system_prompt.trim() || undefined,
      tool_names: payload.tool_names,
      status: "deploying" as never,
    });
    const refreshed = await refreshAgentInstructions(agent.id, {
      instruction_text: payload.system_prompt.trim() || undefined,
      force: true,
    });
    qc.setQueryData(["agent", slug], refreshed);
    await qc.invalidateQueries({ queryKey: ["agent", slug] });
    return refreshed;
  }

  async function saveFixChanges(payload: {
    system_prompt: string;
    tool_names: string[];
  }) {
    setSaving(true);
    setSaveError(null);
    try {
      await persistFixChanges(payload);
      toast.success("ذخیره انجام شد");
    } catch (e: unknown) {
      const apiErr = handleApiError(e, {
        event: "agent.fix.save",
        toast: true,
        toastTitle: "خطا در ذخیره",
      });
      setSaveError(apiErr.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAndRetest(payload: {
    system_prompt: string;
    tool_names: string[];
  }) {
    if (!agent) return;
    setRetesting(true);
    setSaveError(null);
    try {
      await persistFixChanges(payload);
      await startAgentValidation(agent.id);
      const qs = new URLSearchParams({ slug: agent.slug, name: agent.name });
      router.push(`/agents/create?${qs.toString()}`);
    } catch (e: unknown) {
      const apiErr = handleApiError(e, {
        event: "agent.fix.retest",
        toast: true,
        toastTitle: "خطا در ذخیره",
      });
      setSaveError(apiErr.message);
      await appAlert({
        title: "خطا",
        message: apiErr.message || "ذخیره یا شروع مجدد تست ممکن نشد.",
        tone: "danger",
      });
    } finally {
      setRetesting(false);
    }
  }

  async function saveEditChanges() {
    if (!agent || !draft) return;
    const validationError = validateAgentEditorDraft(agent, draft);
    if (validationError) {
      setSaveError(validationError);
      await appAlert({ title: "ورودی نامعتبر", message: validationError, tone: "danger" });
      return;
    }

    const shouldRefreshGuide = refreshExecutionGuide;
    setSaving(true);
    setSaveError(null);
    try {
      await persistAgentEditor(agent, draft, {
        syncPermissions: Boolean(me?.is_superuser),
        initialPermissions,
      });
      await qc.invalidateQueries({ queryKey: ["agent", slug] });
      await qc.invalidateQueries({ queryKey: ["agent-permissions"] });
      toast.success("تغییرات ذخیره شد");

      if (shouldRefreshGuide) {
        setEditPhase("generating-guide");
        setSaving(false);
        try {
          const regen = await regenerateExecutionGuide(agent.id, { wait: true });
          if (regen.completed) {
            await qc.invalidateQueries({ queryKey: ["agent-execution", agent.id] });
            const status = await fetchAgentExecutionGuideStatus(agent.id);
            setGuideSource(status.source ?? null);
            setEditPhase("complete");
            return;
          }
          const status = await waitForExecutionGuide(agent.id);
          setGuideSource(status.source ?? null);
          await qc.invalidateQueries({ queryKey: ["agent-execution", agent.id] });
          setEditPhase("complete");
        } catch (guideErr: unknown) {
          const guideApiErr = handleApiError(guideErr, { event: "agent.edit.guide" });
          setSaveError(`ذخیره انجام شد، اما راهنمای اجرا به‌روز نشد: ${guideApiErr.message}`);
          toast.warning("ذخیره شد — به‌روزرسانی راهنما ناموفق بود");
          setEditPhase("form");
        }
        return;
      }
      setEditPhase("complete");
    } catch (e: unknown) {
      const apiErr = handleApiError(e, {
        event: "agent.edit.save",
        toast: true,
        toastTitle: "خطا در ذخیره",
      });
      setSaveError(apiErr.message);
      setEditPhase("form");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !agent) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-stone-500">
        <LoadingSpinner />
        در حال بارگذاری…
      </div>
    );
  }

  if (mode === "edit" && !draft) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-stone-500">
        <LoadingSpinner />
        در حال آماده‌سازی فرم…
      </div>
    );
  }

  return (
    <div className={`mx-auto space-y-6 p-6 ${mode === "edit" ? "max-w-4xl" : "max-w-2xl"}`}>
      <Stagger className="space-y-6">
        <StaggerItem variant="slideUp">
          <div>
            <Link
              href={mode === "edit" ? `/agents/${slug}` : "/admin"}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              ← {mode === "edit" ? "بازگشت به ایجنت" : "بازگشت به پنل ادمین"}
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-stone-900">
              {mode === "edit" ? "ویرایش ایجنت" : "اصلاح ایجنت"}
            </h1>
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

        {editPhase === "generating-guide" && mode === "edit" && (
          <StaggerItem variant="scaleIn">
            <Card className="border-brand-200 bg-gradient-to-l from-brand-50/80 to-white">
              <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
                <LoadingSpinner />
                <div className="space-y-1">
                  <p className="text-lg font-bold text-stone-900">در حال به‌روزرسانی راهنمای اجرا…</p>
                  <p className="max-w-sm text-sm leading-relaxed text-stone-600">
                    هوش مصنوعی در حال بازنویسی تب «اجرا و راهنما» بر اساس تغییرات شماست.
                  </p>
                </div>
              </CardBody>
            </Card>
          </StaggerItem>
        )}

        {editPhase === "complete" && mode === "edit" && (
          <StaggerItem variant="scaleIn">
            <Card className="border-brand-200/80 bg-gradient-to-l from-brand-50/80 to-white">
              <CardBody className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <CheckCircle2 className="h-9 w-9" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-bold text-stone-900">ویرایش تمام شد</p>
                  <p className="max-w-sm text-sm leading-relaxed text-stone-600">
                    {guideSource === "llm"
                      ? "راهنمای اجرا با هوش مصنوعی به‌روز شد — ایجنت آماده استفاده است."
                      : "تغییرات ذخیره شد — می‌توانید وارد پنل ایجنت شوید."}
                  </p>
                </div>
                <Button className="w-full max-w-xs" onClick={() => router.push(`/agents/${slug}`)}>
                  <Sparkles className="h-4 w-4" />
                  ورود به ایجنت
                </Button>
                <Button
                  variant="ghost"
                  className="text-xs text-stone-500"
                  onClick={() => {
                    setEditPhase("form");
                    setGuideSource(null);
                    void (async () => {
                      const fresh = await qc.fetchQuery({
                        queryKey: ["agent", slug],
                        queryFn: () => fetchAgentBySlug(slug),
                      });
                      const perms = await qc.fetchQuery({
                        queryKey: ["agent-permissions"],
                        queryFn: fetchAgentPermissions,
                      });
                      if (fresh) {
                        setDraft(
                          createEditorDraftFromAgent(
                            fresh,
                            (perms ?? []).filter((p) => p.agent_id === fresh.id)
                          )
                        );
                      }
                    })();
                  }}
                >
                  ویرایش دوباره
                </Button>
              </CardBody>
            </Card>
          </StaggerItem>
        )}

        {editPhase === "form" && mode === "edit" && draft && (
          <>
            <StaggerItem variant="slideUp">
              <AgentEditorForm agent={agent} draft={draft} onChange={setDraft} disabled={saving} />
            </StaggerItem>
            {saveError && (
              <StaggerItem variant="fadeIn">
                <p className="rounded-xl border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-sm text-accent-red">
                  {saveError}
                </p>
              </StaggerItem>
            )}
            <StaggerItem variant="fadeIn">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={refreshExecutionGuide}
                  disabled={saving}
                  onChange={(e) => setRefreshExecutionGuide(e.target.checked)}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-semibold text-stone-800">
                    به‌روزرسانی راهنمای اجرا
                  </span>
                  <span className="block text-xs leading-relaxed text-stone-500">
                    بعد از ذخیره، تب «اجرا و راهنما» با هوش مصنوعی بازنویسی می‌شود. برای ذخیره
                    سریع‌تر خاموش کنید.
                  </span>
                </span>
              </label>
            </StaggerItem>
            <StaggerItem variant="scaleIn">
              <Button className="w-full" disabled={saving} onClick={() => void saveEditChanges()}>
                {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
              </Button>
            </StaggerItem>
          </>
        )}

        {mode === "fix" && editPhase === "form" && (
          <FixModeForm
            agent={agent}
            saving={saving}
            retesting={retesting}
            saveError={saveError}
            onSaveChanges={(p) => void saveFixChanges(p)}
            onSaveAndRetest={(p) => void saveAndRetest(p)}
          />
        )}

        {editPhase === "form" && (
          <StaggerItem variant="fadeIn">
            <Link href={`/agents/${slug}`} className="block">
              <Button variant="ghost" className="w-full">
                <ArrowRight className="h-4 w-4" />
                {mode === "edit" ? "انصراف و بازگشت" : "مشاهده پنل ایجنت (بدون اصلاح)"}
              </Button>
            </Link>
          </StaggerItem>
        )}
      </Stagger>
    </div>
  );
}