"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, FlaskConical, XCircle } from "lucide-react";
import { AgentExecutionTrace } from "@/components/agents/agent-execution-trace";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import {
  fetchAgentActions,
  fetchAgentExecution,
  fetchAgentFiles,
  fetchAgentLinkGraph,
  fetchAgentTemplates,
  invokeAgent,
  runAgentAction,
  uploadAgentFile,
} from "@/lib/api";
import { displayAgentFileName, isRuntimeSampleFileName } from "@/lib/agent-file-roles";
import {
  buildAgentTestPlan,
  buildSampleFile,
  policyPrefersXlsx,
  resolveKarkardSampleFile,
  sampleVariablesForAction,
  type AgentTestStepPlan,
} from "@/lib/agent-test-fixtures";
import { downloadFileWithAuth, extractDownloadUrls } from "@/lib/download-url";
import { showErrorToast } from "@/lib/toast-errors";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import { getErrorMessage } from "@/lib/errors";
import type { Agent, ExecutionTraceStep, InvokeResponse } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type StepStatus = "pending" | "running" | "ok" | "fail" | "skip";

type StepState = {
  plan: AgentTestStepPlan;
  status: StepStatus;
  detail?: string;
  trace?: ExecutionTraceStep[];
  modelName?: string | null;
  llmProvider?: string | null;
  durationMs?: number;
  showTrace?: boolean;
};

type Props = {
  agent: Agent;
  onChatExchange?: (user: string, assistant: string) => void;
};

function applyInvokeResult(
  res: InvokeResponse,
  userLine: string,
  onChatExchange?: (user: string, assistant: string) => void
): Pick<StepState, "detail" | "trace" | "modelName" | "llmProvider" | "durationMs"> {
  const out = formatAssistantOutput(res.output);
  onChatExchange?.(userLine, out);
  return {
    detail: out.slice(0, 400),
    trace: res.execution_trace ?? [],
    modelName: res.model_name,
    llmProvider: res.llm_provider,
    durationMs: res.duration_ms,
  };
}

export function AgentTestPanel({ agent, onChatExchange }: Props) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [stepStates, setStepStates] = useState<StepState[] | null>(null);

  const { data: actions = [] } = useQuery({
    queryKey: ["agent-actions", agent.id],
    queryFn: () => fetchAgentActions(agent.id),
    enabled: agent.capabilities?.actions_enabled,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["agent-templates", agent.id],
    queryFn: () => fetchAgentTemplates(agent.id),
    enabled: agent.capabilities?.templates_enabled,
  });

  const { data: existingFiles = [] } = useQuery({
    queryKey: ["agent-files", agent.id],
    queryFn: () => fetchAgentFiles(agent.id),
    enabled: agent.capabilities?.file_upload_enabled,
  });

  const { data: guide } = useQuery({
    queryKey: ["agent-execution", agent.id],
    queryFn: () => fetchAgentExecution(agent.id),
    staleTime: 5 * 60_000,
  });

  const plan = useMemo(() => {
    const runtimeFiles = existingFiles.filter((f) => isRuntimeSampleFileName(f.filename));
    if (guide?.test_steps?.length) {
      return guide.test_steps.map((s) => {
        const step: AgentTestStepPlan = {
          kind: s.kind as AgentTestStepPlan["kind"],
          label: s.label,
          description: s.description,
          actionSlug: s.action_slug ?? undefined,
          prompt: s.prompt ?? undefined,
        };
        if (s.kind === "action") {
          const act =
            actions.find((a) => a.slug === s.action_slug) ?? actions[0];
          if (act) {
            step.actionSlug = act.slug;
            step.variables = sampleVariablesForAction(act);
          }
        }
        if (s.kind === "upload" && agent.file_policy) {
          const policy = agent.file_policy;
          const alreadyHas =
            runtimeFiles.length > 0 &&
            (!policyPrefersXlsx(policy) ||
              runtimeFiles.some((f) => /\.xlsx?$/i.test(f.filename)));
          if (alreadyHas) {
            return {
              kind: "info" as const,
              label: "فایل نمونه از قبل موجود",
              description: `${displayAgentFileName(runtimeFiles[0].filename)} — آپلود مجدد لازم نیست.`,
            };
          }
          if (policyPrefersXlsx(policy)) {
            step.resolveFile = resolveKarkardSampleFile;
          } else {
            step.file = buildSampleFile(policy);
          }
        }
        return step;
      });
    }
    return buildAgentTestPlan(agent, actions, templates, runtimeFiles);
  }, [guide, agent, actions, templates, existingFiles]);

  async function runStep(
    step: AgentTestStepPlan,
    index: number,
    states: StepState[]
  ): Promise<StepState[]> {
    const next = [...states];
    next[index] = { ...next[index], status: "running", showTrace: true };
    setStepStates(next);

    try {
      if (step.kind === "info") {
        next[index] = { ...next[index], status: "ok", detail: step.description };
        return next;
      }
      if (step.kind === "upload" && (step.file || step.resolveFile)) {
        const file = step.file ?? (await step.resolveFile!());
        const uploaded = await uploadAgentFile(agent.id, file);
        await qc.invalidateQueries({ queryKey: ["agent-files", agent.id] });
        const msg = `فایل نمونه «${uploaded.filename}» با موفقیت آپلود شد.`;
        onChatExchange?.("تست ادمین — آپلود فایل", msg);
        next[index] = {
          ...next[index],
          status: "ok",
          detail: msg,
          trace: [
            {
              kind: "user_input",
              label: "آپلود فایل",
              detail: uploaded.filename,
            },
          ],
        };
        return next;
      }
      if (step.kind === "action" && step.actionSlug) {
        const res = await runAgentAction(agent.id, step.actionSlug, step.variables ?? {});
        const out = res.output ?? "";
        if (/"error"\s*:/.test(out) || /validation error/i.test(out)) {
          throw new Error(out.slice(0, 400));
        }
        const userLine = `تست ادمین — ${step.label}`;
        const applied = applyInvokeResult(res, userLine, onChatExchange);
        next[index] = { ...next[index], status: "ok", ...applied, showTrace: true };
        return next;
      }
      if (step.kind === "graph") {
        const graph = await fetchAgentLinkGraph(agent.id);
        next[index] = {
          ...next[index],
          status: "ok",
          detail: `${graph.nodes.length} گره · ${graph.edges.length} یال`,
        };
        return next;
      }
      if (step.kind === "invoke" && step.prompt) {
        const res = await invokeAgent(agent.id, step.prompt);
        const applied = applyInvokeResult(res, step.prompt, onChatExchange);
        next[index] = { ...next[index], status: "ok", ...applied, showTrace: true };
        return next;
      }
      next[index] = { ...next[index], status: "skip", detail: "رد شد" };
      return next;
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      next[index] = {
        ...next[index],
        status: "fail",
        detail: msg,
        trace: [
          {
            kind: "llm_response",
            label: "خطا",
            detail: msg,
          },
        ],
        showTrace: true,
      };
      return next;
    }
  }

  function toggleTrace(index: number) {
    setStepStates((prev) => {
      if (!prev) return prev;
      const copy = [...prev];
      copy[index] = { ...copy[index], showTrace: !copy[index].showTrace };
      return copy;
    });
  }

  async function runTest() {
    const initial: StepState[] = plan.map((p) => ({ plan: p, status: "pending" }));
    setStepStates(initial);
    setRunning(true);
    let states = initial;
    for (let i = 0; i < plan.length; i++) {
      states = await runStep(plan[i], i, states);
      setStepStates([...states]);
    }
    setRunning(false);
    await qc.invalidateQueries({ queryKey: ["activity", agent.id] });
  }

  const hasRunnable = plan.some((s) => s.kind !== "info");

  return (
    <Card className="max-h-[min(480px,55vh)] shrink-0 border-brand-200/80 bg-brand-50/20">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-brand-700" />
          <div>
            <h3 className="text-sm font-bold text-stone-900">تست ادمین · ردیابی AI</h3>
            <p className="text-[11px] text-stone-500">
              هر مرحله از API مدل (gapgpt) + ابزارها — همان مسیر production
            </p>
          </div>
        </div>
        <Button
          className="px-3 py-1.5 text-xs"
          onClick={runTest}
          disabled={running || !hasRunnable}
        >
          {running ? (
            <LoadingSpinner />
          ) : (
            <FlaskConical className="h-4 w-4" />
          )}
          اجرای تست خودکار
        </Button>
      </CardHeader>
      <CardBody className="max-h-[min(400px,48vh)] space-y-3 overflow-y-auto">
        {stepStates ? (
          <Stagger initial={false} className="space-y-2">
            {stepStates.map((s, i) => (
              <StaggerItem key={`${s.plan.kind}-${i}`} variant="slideRight">
                <div className="rounded-xl border border-stone-200/80 bg-white px-3 py-2 text-xs">
                  <div className="flex gap-2">
                    <span className="mt-0.5 shrink-0">
                      {s.status === "running" && (
                        <LoadingSpinner />
                      )}
                      {s.status === "ok" && (
                        <CheckCircle2 className="h-4 w-4 text-accent-green" />
                      )}
                      {s.status === "fail" && (
                        <XCircle className="h-4 w-4 text-accent-red" />
                      )}
                      {s.status === "pending" && (
                        <span className="inline-block h-4 w-4 rounded-full border border-stone-300" />
                      )}
                      {s.status === "skip" && (
                        <span className="text-stone-400">—</span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-stone-800">{s.plan.label}</p>
                        {s.durationMs != null && s.durationMs > 0 && (
                          <span className="text-[10px] text-stone-400">{s.durationMs}ms</span>
                        )}
                      </div>
                      <p className="text-stone-500">{s.detail ?? s.plan.description}</p>
                      {s.detail &&
                        extractDownloadUrls(s.detail).map((url, urlIdx) => (
                          <button
                            key={`${i}-dl-${urlIdx}-${url}`}
                            type="button"
                            className="mt-1 inline-block text-xs font-semibold text-brand-700 underline"
                            onClick={() =>
                              downloadFileWithAuth(url).catch((err) =>
                                showErrorToast(err, "دانلود فایل")
                              )
                            }
                          >
                            دانلود نتیجه
                          </button>
                        ))}
                      {(s.trace?.length ?? 0) > 0 && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => toggleTrace(i)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700"
                          >
                            {s.showTrace ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                            {s.showTrace ? "بستن ردیاب AI" : "نمایش ردیاب AI"}
                          </button>
                          {s.showTrace && (
                            <div className="mt-2 border-t border-stone-100 pt-2">
                              <AgentExecutionTrace
                                trace={s.trace ?? []}
                                modelName={s.modelName}
                                llmProvider={s.llmProvider}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <ul className="space-y-1 text-xs text-stone-500">
            {plan.map((p, i) => (
              <li key={`${p.kind}-${i}`}>
                • {p.label}: {p.description}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}