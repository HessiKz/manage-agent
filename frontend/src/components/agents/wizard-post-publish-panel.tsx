"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, Code2, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgentClarificationQuestions,
  type PlanningQuestion,
} from "@/components/agents/agent-clarification-questions";
import { AgentTrainingPanel } from "@/components/agents/agent-training-panel";
import {
  approveAgentDashboard,
  fetchAgentDashboard,
  generateAgentDashboard,
  startAgentTraining,
  startAgentValidation,
  submitValidationAnswers,
} from "@/lib/api";
import {
  needsTrainingBootstrap,
  PLANNING_LOCALE,
  resolveTestingPhase,
  TEST_STEPS,
  validationStepIndex,
  type ValidationReport,
} from "@/lib/agent-testing-phase";
import { resolveVisiblePlanningOnPage } from "@/lib/support-testing-actions";
import type { Agent } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

const PHASE_LABELS: Record<string, string> = {
  instruction_compile: "کامپایل دستورالعمل",
  tool_resolution: "بررسی ابزارها",
  script_generate: "تولید اسکریپت",
  script_verify: "تأیید اسکریپت",
  file_setup: "آماده‌سازی فایل",
  planning: "تحلیل عمیق ایجنت",
  invoke: "تست گفت‌وگو",
};

function isAwaitingPlanningAnswers(validation: ValidationReport | null): boolean {
  return Boolean(
    validation?.planning?.awaiting_answers &&
      (validation.planning?.questions?.length ?? 0) > 0
  );
}

function isPlanningAnalyzing(validation: ValidationReport | null): boolean {
  return validation?.current_phase === "planning" && !isAwaitingPlanningAnswers(validation);
}

function parseValidation(agent: Agent | undefined): ValidationReport | null {
  const raw = agent?.config_json?.validation;
  if (!raw || typeof raw !== "object") return null;
  return raw as ValidationReport;
}

function StepList({
  activeIndex,
  done,
  completedThrough = -1,
}: {
  activeIndex: number;
  done: boolean;
  completedThrough?: number;
}) {
  return (
    <ul className="space-y-2">
      {TEST_STEPS.map((label, i) => {
        const complete = done || (completedThrough >= 0 && i <= completedThrough);
        const current = !done && !complete && i === activeIndex;
        return (
          <li
            key={label}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
              current ? "border-brand-200 bg-brand-50/50" : "border-stone-100 bg-white/80"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                complete
                  ? "bg-brand-600 text-white"
                  : current
                    ? "bg-brand-100 text-brand-700"
                    : "bg-stone-100 text-stone-400"
              }`}
            >
              {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={complete || current ? "font-medium text-stone-800" : "text-stone-500"}>
              {label}
            </span>
            {current && <LoadingSpinner />}
          </li>
        );
      })}
    </ul>
  );
}

type Props = {
  agent: Agent;
  stepLabel: "تست تعاملی" | "تست خودکار";
  onAgentRefresh: () => void;
};

export function WizardPostPublishPanel({ agent, stepLabel, onAgentRefresh }: Props) {
  const qc = useQueryClient();
  const bootstrapStarted = useRef(false);
  const dashboardSkipStarted = useRef(false);
  const planningRefreshStarted = useRef(false);

  const validation = parseValidation(agent);
  const phase = resolveTestingPhase(agent.status, validation);
  const failures = validation?.failures ?? [];
  const activeStep = validationStepIndex(validation);
  const awaitingAnswers = isAwaitingPlanningAnswers(validation);
  const needsPersianPlanningRefresh =
    awaitingAnswers && validation?.planning?.locale !== PLANNING_LOCALE;
  const planningAnalyzing = isPlanningAnalyzing(validation) || needsPersianPlanningRefresh;
  const planningQuestions = (validation?.planning?.questions ?? []) as PlanningQuestion[];

  const workspaceScript =
    agent.config_json?.workspace_script && typeof agent.config_json.workspace_script === "object"
      ? (agent.config_json.workspace_script as {
          needed?: boolean;
          verified_at?: string;
        })
      : null;
  const runtimePlan =
    agent.config_json?.runtime_plan && typeof agent.config_json.runtime_plan === "object"
      ? (agent.config_json.runtime_plan as {
          prepared?: boolean;
          primary_tool?: string | null;
        })
      : null;

  const handleSubmitAnswers = useCallback(
    async (answers: Record<string, string>) => {
      await submitValidationAnswers(agent.id, answers);
      onAgentRefresh();
    },
    [agent.id, onAgentRefresh]
  );

  useEffect(() => {
    if (bootstrapStarted.current) return;
    if (!needsTrainingBootstrap(validation)) return;
    bootstrapStarted.current = true;
    void startAgentTraining(agent.id)
      .then(onAgentRefresh)
      .catch(() => {
        bootstrapStarted.current = false;
      });
  }, [agent.id, validation, onAgentRefresh]);

  useEffect(() => {
    if (!awaitingAnswers) return;
    if (sessionStorage.getItem("ma_support_ui_playing") !== "1") return;
    let cancelled = false;
    void (async () => {
      const ok = await resolveVisiblePlanningOnPage();
      if (!cancelled && ok) onAgentRefresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [awaitingAnswers, agent.id, agent.slug, onAgentRefresh]);

  useEffect(() => {
    if (planningRefreshStarted.current) return;
    if (!needsPersianPlanningRefresh) return;
    planningRefreshStarted.current = true;
    void startAgentValidation(agent.id)
      .then(onAgentRefresh)
      .catch(() => {
        planningRefreshStarted.current = false;
      });
  }, [agent.id, needsPersianPlanningRefresh, onAgentRefresh]);

  useEffect(() => {
    if (phase !== "dashboard_review" || dashboardSkipStarted.current) return;
    dashboardSkipStarted.current = true;
    void (async () => {
      try {
        const dashMeta = agent.config_json?.dashboard as
          | { approved?: boolean; draft?: unknown }
          | undefined;
        if (dashMeta?.approved) {
          onAgentRefresh();
          return;
        }
        let dash = await fetchAgentDashboard(agent.id, true);
        if (!dash.has_pending_draft) {
          await generateAgentDashboard(agent.id, {
            prompt: "پنل پیش‌فرض برای شروع تست خودکار",
            merge_with_existing: true,
          });
          dash = await fetchAgentDashboard(agent.id, true);
        }
        if (!dash.has_pending_draft) {
          dashboardSkipStarted.current = false;
          return;
        }
        await approveAgentDashboard(agent.id);
        onAgentRefresh();
      } catch {
        dashboardSkipStarted.current = false;
      }
    })();
  }, [phase, agent.id, agent.config_json, onAgentRefresh]);

  useEffect(() => {
    if (phase === "success" || phase === "error" || phase === "warning") {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notification-count"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
    }
  }, [phase, qc]);

  if (stepLabel === "تست تعاملی") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          یک سؤال نمونه بپرسید و شکل پاسخ را تأیید کنید. این مرحله نقش ایجنت را عوض نمی‌کند.
        </p>
        <AgentTrainingPanel agent={agent} onCompleted={onAgentRefresh} />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {phase === "dashboard_review" ? (
        <motion.div key="dashboard-skip" className="space-y-4 py-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <LoadingIndicator
            size="panel"
            stage="در حال آماده‌سازی برای تست خودکار…"
            detail="طراحی ویجت اختیاری است — بعداً از تب «پنل ایجنت» می‌توانید ویجت اضافه کنید."
          />
        </motion.div>
      ) : phase === "success" ? (
        <motion.div
          key="success"
          className="space-y-5 text-center"
          data-ma-support="wizard-testing-complete"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <p className="text-lg font-bold text-stone-900">ایجنت آماده است</p>
          </div>
          <StepList activeIndex={TEST_STEPS.length} done />
          <Link href={`/agents/${agent.slug}`}>
            <Button className="w-full">
              <ArrowRight className="h-4 w-4" />
              باز کردن ایجنت
            </Button>
          </Link>
        </motion.div>
      ) : phase === "error" || phase === "warning" ? (
        <motion.div
          key="error"
          className="space-y-4"
          data-ma-support="wizard-testing-error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full ${
                phase === "error" ? "bg-accent-red/10 text-accent-red" : "bg-amber-100 text-amber-700"
              }`}
            >
              {phase === "error" ? <XCircle className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
            </div>
            <p className="font-bold text-stone-900">
              {phase === "error" ? "تست ناموفق" : "تست ناقص"}
            </p>
          </div>
          {failures.length > 0 && (
            <ul className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-stone-100 bg-stone-50/80 p-3 text-xs">
              {failures.map((f, i) => (
                <li key={`${f.phase}-${i}`} className="rounded-lg bg-white px-3 py-2 text-stone-700">
                  <span className="font-semibold">{PHASE_LABELS[f.phase] ?? f.phase}</span>
                  <p className="mt-0.5">{f.message}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-center text-xs text-stone-500">
            به مراحل قبل برگردید، تنظیمات را اصلاح کنید و دوباره از «بازبینی» ادامه دهید.
          </p>
        </motion.div>
      ) : (
        <motion.div key="testing" className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {(workspaceScript || runtimePlan) && (
            <div className="flex flex-wrap justify-center gap-2">
              {workspaceScript && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600">
                  <Code2 className="h-3.5 w-3.5 text-brand-600" />
                  اسکریپت: {workspaceScript.needed ? "فعال" : "لازم نیست"}
                </span>
              )}
              {runtimePlan && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600">
                  <Wrench className="h-3.5 w-3.5 text-brand-600" />
                  ابزار: {runtimePlan.primary_tool || "گفت‌وگو"}
                </span>
              )}
            </div>
          )}
          {awaitingAnswers && !needsPersianPlanningRefresh ? (
            <AgentClarificationQuestions
              analysis={validation?.planning?.analysis}
              questions={planningQuestions}
              onSubmit={handleSubmitAnswers}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-2">
              <LoadingIndicator
                size="panel"
                stage={
                  planningAnalyzing
                    ? needsPersianPlanningRefresh
                      ? "در حال بازسازی تحلیل به فارسی…"
                      : "در حال تحلیل عمیق ایجنت…"
                    : `در حال ${PHASE_LABELS[validation?.current_phase ?? ""] ?? TEST_STEPS[activeStep] ?? "تست خودکار"}…`
                }
                detail={
                  activeStep === 4
                    ? "تست گفت‌وگو ممکن است چند دقیقه طول بکشد."
                    : undefined
                }
                activeStageId={String(activeStep)}
                stages={TEST_STEPS.map((label, i) => ({ id: String(i), label }))}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function postPublishStepReady(
  agent: Agent,
  stepLabel: "تست تعاملی" | "تست خودکار"
): boolean {
  const validation = parseValidation(agent);
  const phase = resolveTestingPhase(agent.status, validation);
  if (stepLabel === "تست تعاملی") {
    return Boolean(validation?.training_completed) || phase !== "training";
  }
  return (
    phase === "testing" ||
    phase === "success" ||
    phase === "error" ||
    phase === "warning"
  );
}

export function suggestPostPublishStep(agent: Agent): "تست تعاملی" | "تست خودکار" {
  const validation = parseValidation(agent);
  const phase = resolveTestingPhase(agent.status, validation);
  if (phase === "training") return "تست تعاملی";
  return "تست خودکار";
}