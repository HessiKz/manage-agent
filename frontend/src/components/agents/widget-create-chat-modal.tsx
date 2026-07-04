"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, FlaskConical, LayoutGrid, LineChart, PieChart, Sparkles, Table2, X, XCircle, Lock } from "lucide-react";
import { AgentDashboardView } from "@/components/agents/agent-dashboard-view";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  generateAgentDashboard,
  rejectAgentDashboardDraft,
  type DashboardGenerateResult,
} from "@/lib/api";
import { buildWidgetAdminTestPrompt } from "@/lib/agent-test-fixtures";
import { handleApiError } from "@/lib/api-error-handler";
import { plainTextPreview } from "@/lib/plain-text-preview";
import { normalizeAgentDashboard } from "@/lib/normalize-agent-dashboard";
import {
  backendKindForBuilder,
  BUILDER_WIDGET_TYPES,
  buildWidgetPrompt,
  KPI_CHART_VARIANTS,
  type BuilderWidgetType,
  type WidgetBuilderOptions,
} from "@/lib/widget-builder";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { easeOut } from "@/components/motion/variants";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { parseWidgetPlan, isWidgetEnabledInPlan } from "@/lib/widget-plan";
import { cn } from "@/lib/utils";
import { invalidateAgentDashboardQueries } from "@/lib/dashboard-draft";
import type { Agent, AgentDashboard } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type Step = "type" | "customize" | "generating" | "preview";

type Props = {
  agentId: string;
  agent?: Agent;
  dashboard?: AgentDashboard | null;
  showAdminTest?: boolean;
  initialType?: BuilderWidgetType;
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

const TYPE_ICONS: Record<BuilderWidgetType, typeof LayoutGrid> = {
  stat_card: LayoutGrid,
  line_chart: LineChart,
  pie_chart: PieChart,
  review_table: Table2,
};

const STEPS: { id: Step; label: string }[] = [
  { id: "type", label: "نوع" },
  { id: "customize", label: "تنظیمات" },
  { id: "preview", label: "بازبینی" },
];

function stepIndex(step: Step): number {
  if (step === "generating") return 1;
  if (step === "preview") return 2;
  if (step === "customize") return 1;
  return 0;
}

const selectClass =
  "focus-ring w-full rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm transition-colors focus:border-brand-400";

export function WidgetCreateChatModal({
  agentId,
  agent,
  dashboard,
  showAdminTest = false,
  initialType,
  open,
  onClose,
  onCreated,
}: Props) {
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("type");
  const [widgetType, setWidgetType] = useState<BuilderWidgetType>("stat_card");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [chartVariant, setChartVariant] = useState("savings");
  const [dataHint, setDataHint] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DashboardGenerateResult | null>(null);

  const widgetPlan = useMemo(
    () => parseWidgetPlan(agent?.config_json, agent?.department, agent?.description),
    [agent?.config_json, agent?.department, agent?.description]
  );

  const allowedBuilderTypes = BUILDER_WIDGET_TYPES;

  const previewDashboard = useMemo(() => {
    if (!result?.draft) return null;
    return normalizeAgentDashboard(result.draft as Record<string, unknown>);
  }, [result]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setStep("type");
      setWidgetType(initialType ?? "stat_card");
      setTitle("");
      setDescription("");
      setChartVariant("savings");
      setDataHint("");
      setExtraNotes("");
      setError(null);
      setResult(null);
    } else if (initialType) {
      setWidgetType(initialType);
      setStep("customize");
    }
  }, [open, initialType]);

  useEffect(() => {
    if (!open || widgetType !== "review_table" || !widgetPlan.review_table.enabled) return;
    if (!title && widgetPlan.review_table.title) {
      setTitle(widgetPlan.review_table.title);
    }
    if (!description && widgetPlan.review_table.scope) {
      setDescription(widgetPlan.review_table.scope);
    }
  }, [open, widgetType, widgetPlan, title, description]);

  useEffect(() => {
    if (!open || widgetType !== "pie_chart") return;
    if (!title) setTitle("توزیع نتایج");
    if (!description && widgetPlan.pie_chart.hint) {
      setDescription(widgetPlan.pie_chart.hint);
    }
  }, [open, widgetType, widgetPlan, title, description]);

  useEffect(() => {
    if (!open || widgetType !== "line_chart") return;
    if (!title) setTitle("روند فعالیت");
    if (!description && widgetPlan.line_chart.hint) {
      setDescription(widgetPlan.line_chart.hint);
    }
  }, [open, widgetType, widgetPlan, title, description]);

  useEffect(() => {
    if (!open || widgetType !== "stat_card") return;
    const name = agent?.name ?? "ایجنت";
    if (!title) setTitle(`شاخص‌های کلیدی ${name}`);
    if (!description) {
      setDescription("متریک‌های اختصاصی ایجنت: اجرا، موفقیت، زمان پاسخ، کاربران فعال");
    }
  }, [open, widgetType, agent?.name, title, description]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onClose]);

  const options: WidgetBuilderOptions = {
    widgetType,
    title,
    description,
    chartVariant: widgetType === "stat_card" ? chartVariant : undefined,
    dataHint,
  };

  const composedPrompt = useMemo(
    () => buildWidgetPrompt(agent?.name ?? "ایجنت", options, extraNotes),
    [agent?.name, options, extraNotes]
  );

  async function runGenerate(prompt: string) {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setStep("generating");
    try {
      const res = await generateAgentDashboard(agentId, {
        prompt: prompt.trim(),
        widget_type: backendKindForBuilder(widgetType),
        merge_with_existing: true,
      });
      setResult(res);
      setStep("preview");
    } catch (e: unknown) {
      setError(handleApiError(e, { toast: true, toastTitle: "خطا در ساخت ویجت" }).message);
      setStep("customize");
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    await onCreated();
    await invalidateAgentDashboardQueries(qc, agentId);
    onClose();
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      await rejectAgentDashboardDraft(agentId);
      await onCreated();
      await invalidateAgentDashboardQueries(qc, agentId);
      onClose();
    } catch (e: unknown) {
      setError(handleApiError(e, { toast: true, toastTitle: "خطا در رد پیش‌نمایش" }).message);
    } finally {
      setBusy(false);
    }
  }

  function handleEdit() {
    setResult(null);
    setStep("customize");
  }

  async function runAdminTest() {
    if (!agent) return;
    const prompt = buildWidgetAdminTestPrompt(agent, dashboard);
    setExtraNotes(prompt);
    setWidgetType("stat_card");
    await runGenerate(prompt);
  }

  if (!mounted || !open) return null;

  const activeStep = stepIndex(step);

  const overlayVariants = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  const panelVariants = reduced
    ? { initial: { opacity: 1, scale: 1 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 1, scale: 1 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: 12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: 8 },
      };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="widget-builder-root"
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6"
          role="presentation"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={overlayVariants}
          transition={{ duration: 0.18, ease: easeOut }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-stone-900/45 backdrop-blur-[3px]"
            aria-label="بستن"
            onClick={() => {
              if (!busy && step !== "generating") onClose();
            }}
          />

          <motion.div
            className="relative flex max-h-[min(90vh,760px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-[0_24px_80px_-12px_rgba(28,25,23,0.28)]"
            data-ma-support="widget-builder-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="widget-builder-title"
            variants={panelVariants}
            transition={{ duration: 0.2, ease: easeOut }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-surface-border bg-gradient-to-l from-brand-50/80 to-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p id="widget-builder-title" className="text-base font-bold text-stone-900">
                      ساخت ویجت
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {step === "preview"
                        ? "پیش‌نمایش را تأیید، ویرایش یا رد کنید"
                        : "نوع ویجت را انتخاب و شخصی‌سازی کنید"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="rounded-lg p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
                  aria-label="بستن"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2">
                {STEPS.map((s, i) => (
                  <div key={s.id} className="flex flex-1 items-center gap-2">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                        i <= activeStep
                          ? "bg-brand-600 text-white"
                          : "bg-stone-100 text-stone-400"
                      )}
                    >
                      {i + 1}
                    </div>
                    <span
                      className={cn(
                        "hidden text-xs font-medium sm:inline",
                        i <= activeStep ? "text-stone-800" : "text-stone-400"
                      )}
                    >
                      {s.label}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div
                        className={cn(
                          "ms-auto hidden h-px flex-1 sm:block",
                          i < activeStep ? "bg-brand-400" : "bg-stone-200"
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {step === "type" && (
                <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {BUILDER_WIDGET_TYPES.map((t) => {
                    const Icon = TYPE_ICONS[t.id];
                    const allowed = allowedBuilderTypes.some((a) => a.id === t.id);
                    return (
                      <StaggerItem key={t.id} variant="scaleIn">
                        <button
                          type="button"
                          disabled={!allowed}
                          data-ma-support={`widget-builder-type-${t.id}`}
                          onClick={() => {
                            if (!allowed) return;
                            setWidgetType(t.id);
                            if (t.id === "review_table" && widgetPlan.review_table.enabled) {
                              setTitle(widgetPlan.review_table.title ?? "");
                              setDescription(widgetPlan.review_table.scope ?? "");
                            }
                            setStep("customize");
                          }}
                          className={cn(
                            "flex w-full flex-col items-start gap-2.5 rounded-xl border p-4 text-right shadow-sm transition",
                            allowed
                              ? "border-surface-border bg-white hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-md"
                              : "cursor-not-allowed border-stone-200 bg-stone-50 opacity-70"
                          )}
                        >
                          <div className="flex w-full items-start justify-between gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100">
                              <Icon className="h-5 w-5 text-brand-700" />
                            </div>
                            {!allowed && <Lock className="h-4 w-4 text-stone-400" />}
                          </div>
                          <span className="text-sm font-semibold text-stone-900">{t.label}</span>
                          <span className="text-xs leading-relaxed text-stone-500">
                            {allowed
                              ? t.description
                              : "در ویزارد ساخت ایجنت فعال نشده — ابتدا آن را روشن کنید."}
                          </span>
                        </button>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              )}

              {step === "customize" && (
                <div className="space-y-5">
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand-700 hover:underline"
                    onClick={() => setStep("type")}
                  >
                    ← تغییر نوع ویجت
                  </button>

                  <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800">
                    {(() => {
                      const Icon = TYPE_ICONS[widgetType];
                      return <Icon className="h-3.5 w-3.5" />;
                    })()}
                    {BUILDER_WIDGET_TYPES.find((t) => t.id === widgetType)?.label}
                  </div>

                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-stone-800">عنوان</span>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={
                        widgetType === "stat_card"
                          ? "مثلاً تیکت‌های باز امروز"
                          : "عنوان ویجت"
                      }
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-stone-800">توضیح برای AI</span>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="چه داده‌ای نشان دهد؟ برای چه کاربری است؟"
                    />
                  </label>

                  {widgetType === "stat_card" && (
                    <>
                      <label className="block space-y-2">
                        <span className="text-sm font-semibold text-stone-800">نوع نمودار</span>
                        <select
                          value={chartVariant}
                          onChange={(e) => setChartVariant(e.target.value)}
                          className={selectClass}
                        >
                          {KPI_CHART_VARIANTS.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-2">
                        <span className="text-sm font-semibold text-stone-800">
                          داده نمونه (اختیاری)
                        </span>
                        <Input
                          value={dataHint}
                          onChange={(e) => setDataHint(e.target.value)}
                          placeholder="مثلاً ۱۲ تیکت · +۳ نسبت به دیروز"
                        />
                      </label>
                    </>
                  )}

                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-stone-800">یادداشت اضافه</span>
                    <Textarea
                      value={extraNotes}
                      onChange={(e) => setExtraNotes(e.target.value)}
                      rows={2}
                      placeholder="جزئیات بیشتر برای AI…"
                      className="bg-stone-50/80"
                    />
                  </label>

                  {showAdminTest && agent && (
                    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                      <p className="text-xs font-semibold text-brand-800">تست ادمین</p>
                      <Button
                        type="button"
                        variant="secondary"
                        className="mt-2 px-3 py-1.5 text-xs"
                        disabled={busy}
                        onClick={runAdminTest}
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        تست سریع
                      </Button>
                    </div>
                  )}

                  <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3.5">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">
                      prompt نهایی
                    </p>
                    <p className="text-sm leading-relaxed text-stone-700">{composedPrompt}</p>
                  </div>

                  {error && (
                    <p
                      className="rounded-lg border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-sm text-accent-red"
                      data-ma-support="widget-builder-error"
                    >
                      {error}
                    </p>
                  )}
                </div>
              )}

              {step === "generating" && (
                <div
                  className="flex flex-col items-center justify-center gap-4 py-16 text-center"
                  data-ma-support="widget-builder-generating"
                >
                  <LoadingSpinner />
                  <div>
                    <p className="text-base font-semibold text-stone-900">در حال ساخت ویجت…</p>
                    <p className="mt-1.5 text-sm text-stone-500">
                      AI در حال طراحی ویجت بر اساس تنظیمات شماست
                    </p>
                  </div>
                </div>
              )}

              {step === "preview" && result && previewDashboard && (
                <div className="space-y-5" data-ma-support="widget-builder-preview">
                  <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3.5">
                    <p className="text-sm font-bold text-brand-900">خلاصه تغییرات</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
                      {plainTextPreview(result.preview_summary)}
                    </p>
                    {(result.widgets_added.length > 0 || result.widgets_modified.length > 0) && (
                      <ul className="mt-3 space-y-1.5 text-sm text-stone-600">
                        {result.widgets_added.map((w) => (
                          <li key={`add-${w}`} className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-green" />
                            {w}
                          </li>
                        ))}
                        {result.widgets_modified.map((w) => (
                          <li key={`mod-${w}`} className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-xl border border-surface-border bg-stone-50/50 p-4 shadow-inner">
                    <AgentDashboardView dashboard={previewDashboard} preview />
                  </div>

                  {error && (
                    <p className="rounded-lg border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-sm text-accent-red">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>

            {(step === "customize" || step === "preview") && (
              <div className="shrink-0 border-t border-surface-border bg-stone-50/80 px-5 py-4">
                {step === "customize" ? (
                  <Button
                    className="w-full"
                    disabled={busy || !description.trim()}
                    data-ma-support="widget-builder-generate"
                    onClick={() => void runGenerate(composedPrompt)}
                  >
                    {busy ? (
                      <LoadingSpinner />
                    ) : (
                      <BarChart3 className="h-4 w-4" />
                    )}
                    ساخت پیش‌نمایش
                  </Button>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="secondary" disabled={busy} onClick={handleEdit}>
                      ویرایش
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-accent-red hover:bg-accent-red/5"
                      disabled={busy}
                      onClick={() => void handleReject()}
                    >
                      <XCircle className="h-4 w-4" />
                      رد
                    </Button>
                    <Button
                      disabled={busy}
                      data-ma-support="widget-builder-approve"
                      onClick={() => void handleApprove()}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      تأیید
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}