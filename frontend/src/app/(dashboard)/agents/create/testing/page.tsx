"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Home,
  Loader2,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAgentBySlug } from "@/lib/api";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { easeOut } from "@/components/motion/variants";
import type { Agent, AgentStatus } from "@/types";

type ValidationFailure = {
  phase: string;
  message: string;
  fixable_in_admin: boolean;
};

type ValidationReport = {
  ok?: boolean;
  state?: string;
  current_phase?: string;
  failures?: ValidationFailure[];
};

const TEST_STEPS = [
  "بارگذاری تنظیمات ایجنت",
  "تست گفت‌وگو با هوش مصنوعی",
  "بررسی ابزارها و اقدامات",
  "جمع‌بندی نتیجه",
];

function parseValidation(agent: Agent | undefined): ValidationReport | null {
  const raw = agent?.config_json?.validation;
  if (!raw || typeof raw !== "object") return null;
  return raw as ValidationReport;
}

function resolvePhase(status: AgentStatus | undefined, validation: ValidationReport | null) {
  if (status === "active") return "success" as const;
  if (status === "error") return "error" as const;
  if (status === "draft" && validation?.state === "done") return "warning" as const;
  return "testing" as const;
}

/** Map backend validation phase → wizard step index (0–3). Never loops. */
function validationStepIndex(validation: ValidationReport | null): number {
  const phase = validation?.current_phase ?? "";
  if (phase === "invoke") return 1;
  if (phase.startsWith("action:") || phase === "actions") return 2;
  if (phase === "finishing" || phase === "done") return 3;
  // starting, file_setup, pending, running (no phase yet)
  return 0;
}

function TestingPulse({ reduced }: { reduced: boolean }) {
  if (reduced) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
        <Bot className="h-10 w-10" />
      </div>
    );
  }

  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-3xl border border-brand-300/60"
          initial={{ opacity: 0.5, scale: 0.85 }}
          animate={{ opacity: 0, scale: 1.35 }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            delay: i * 0.55,
            ease: easeOut,
          }}
        />
      ))}
      <motion.div
        className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: easeOut }}
      >
        <Bot className="h-10 w-10" />
      </motion.div>
    </div>
  );
}

function StepList({ activeIndex, done }: { activeIndex: number; done: boolean }) {
  return (
    <ul className="space-y-2.5">
      {TEST_STEPS.map((label, i) => {
        const complete = done || i < activeIndex;
        const current = !done && i === activeIndex;
        return (
          <motion.li
            key={label}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
              current
                ? "border-brand-200 bg-brand-50/50"
                : complete
                  ? "border-stone-100 bg-white/80"
                  : "border-stone-100 bg-white/80"
            }`}
            initial={false}
            transition={{ duration: 0.18, ease: easeOut }}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                complete
                  ? "bg-brand-600 text-white"
                  : current
                    ? "bg-brand-100 text-brand-700"
                    : "bg-stone-100 text-stone-400"
              }`}
            >
              {complete ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </span>
            <span className={complete || current ? "font-medium text-stone-800" : "text-stone-500"}>
              {label}
            </span>
            {current && <Loader2 className="mr-auto h-4 w-4 animate-spin text-brand-600" />}
          </motion.li>
        );
      })}
    </ul>
  );
}

function AgentTestingContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") ?? "";
  const displayName = searchParams.get("name") ?? "ایجنت جدید";
  const reduced = useReducedMotion();
  const qc = useQueryClient();

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent-validation", slug],
    queryFn: () => fetchAgentBySlug(slug),
    enabled: Boolean(slug),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "deploying") return 2000;
      return false;
    },
  });

  const validation = parseValidation(agent);
  const phase = resolvePhase(agent?.status, validation);
  const failures = validation?.failures ?? [];
  const activeStep = validationStepIndex(validation);

  useEffect(() => {
    if (phase === "success" || phase === "error" || phase === "warning") {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notification-count"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
    }
  }, [phase, qc]);

  if (!slug) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <p className="text-sm text-stone-500">شناسه ایجنت یافت نشد.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-50 via-surface-50 to-surface-50" />
      <div className="relative mx-auto max-w-xl">
        <Stagger className="space-y-6" replayOnRoute>
          <StaggerItem variant="fadeIn">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                تست خودکار ایجنت
              </p>
              <h1 className="mt-2 text-2xl font-bold text-stone-900">{displayName}</h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                {phase === "testing"
                  ? "تست واقعی در حال اجراست — مرحلهٔ فعلی پایین را نشان می‌دهد. مرحلهٔ گفت‌وگو ممکن است چند دقیقه طول بکشد."
                  : phase === "success"
                    ? "تست با موفقیت انجام شد. ایجنت آماده استفاده است."
                    : phase === "error"
                      ? "تست ناموفق بود. تنظیمات را اصلاح کنید."
                      : "تست کامل نشد — احتمالاً مشکل موقت بود."}
              </p>
            </div>
          </StaggerItem>

          <StaggerItem variant="scaleIn">
            <div className="rounded-3xl border border-stone-200/80 bg-white/90 p-6 shadow-card backdrop-blur-sm">
              <AnimatePresence mode="wait">
                {isLoading && !agent ? (
                  <motion.div
                    key="loading"
                    className="flex flex-col items-center gap-4 py-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                    <p className="text-sm text-stone-500">در حال بارگذاری…</p>
                  </motion.div>
                ) : phase === "testing" ? (
                  <motion.div
                    key="testing"
                    className="space-y-6"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: easeOut }}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <TestingPulse reduced={!!reduced} />
                      <div className="flex items-center gap-1.5 text-sm font-medium text-brand-700">
                        <Sparkles className="h-4 w-4" />
                        در حال تست…
                      </div>
                    </div>
                    <StepList activeIndex={activeStep} done={false} />
                    <p className="rounded-xl bg-stone-50 px-4 py-3 text-center text-xs leading-relaxed text-stone-500">
                      می‌توانید به صفحه اصلی برگردید — نتیجه از طریق اعلان‌ها هم اطلاع داده می‌شود.
                      {activeStep === 1 && (
                        <span className="mt-1 block text-brand-700">
                          در حال تست هوش مصنوعی… لطفاً صبر کنید.
                        </span>
                      )}
                    </p>
                  </motion.div>
                ) : phase === "success" ? (
                  <motion.div
                    key="success"
                    className="space-y-6 py-2"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: easeOut }}
                  >
                    <div className="flex flex-col items-center gap-3 text-center">
                      <motion.div
                        className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-brand-700"
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.2, ease: easeOut }}
                      >
                        <CheckCircle2 className="h-11 w-11" />
                      </motion.div>
                      <p className="text-lg font-bold text-stone-900">ایجنت آماده است</p>
                    </div>
                    <StepList activeIndex={TEST_STEPS.length} done />
                    <Link href={`/agents/${slug}`} className="block">
                      <Button className="w-full">
                        <ArrowRight className="h-4 w-4" />
                        باز کردن ایجنت
                      </Button>
                    </Link>
                  </motion.div>
                ) : (
                  <motion.div
                    key="error"
                    className="space-y-5 py-2"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: easeOut }}
                  >
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div
                        className={`flex h-20 w-20 items-center justify-center rounded-full ${
                          phase === "error" ? "bg-accent-red/10 text-accent-red" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {phase === "error" ? (
                          <XCircle className="h-11 w-11" />
                        ) : (
                          <AlertTriangle className="h-11 w-11" />
                        )}
                      </div>
                      <p className="text-lg font-bold text-stone-900">
                        {phase === "error" ? "تست ناموفق" : "تست ناقص"}
                      </p>
                      <p className="text-sm text-stone-500">
                        {phase === "error"
                          ? "تنظیمات ایجنت نیاز به اصلاح دارد."
                          : "ممکن است مشکل موقت باشد — دوباره تست کنید."}
                      </p>
                    </div>

                    {failures.length > 0 && (
                      <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-stone-100 bg-stone-50/80 p-3 text-xs">
                        {failures.map((f, i) => (
                          <li key={`${f.phase}-${i}`} className="rounded-lg bg-white px-3 py-2 text-stone-700">
                            <span className="font-semibold text-stone-900">{f.phase}</span>
                            <p className="mt-0.5 leading-relaxed text-stone-600">{f.message}</p>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Link href={`/agents/${slug}/fix`} className="flex-1">
                        <Button variant="secondary" className="w-full">
                          <Wrench className="h-4 w-4" />
                          اصلاح تنظیمات
                        </Button>
                      </Link>
                      <Link href="/agents/create" className="flex-1">
                        <Button variant="ghost" className="w-full">
                          ساخت دوباره
                        </Button>
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </StaggerItem>

          <StaggerItem variant="slideUp">
            <Link href="/dashboard">
              <Button variant="secondary" className="w-full">
                <Home className="h-4 w-4" />
                بازگشت به صفحه اصلی
              </Button>
            </Link>
          </StaggerItem>
        </Stagger>
      </div>
    </div>
  );
}

export default function AgentTestingPage() {
  return <AgentTestingContent />;
}
