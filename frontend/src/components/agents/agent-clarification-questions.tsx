"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/loading";

export type PlanningQuestion = {
  id: string;
  text: string;
  context?: string;
  options?: string[];
};

type Props = {
  analysis?: string;
  questions: PlanningQuestion[];
  onSubmit: (answers: Record<string, string>) => Promise<void>;
  className?: string;
  /** Chat-style bubbles + option chips (training panel). Default is form cards. */
  variant?: "form" | "chat";
};

const OTHER = "سایر…";

/** When API/LLM left options empty, still show Cursor-style chips (not only Other). */
function resolveQuestionOptions(q: PlanningQuestion): string[] {
  const raw = (q.options ?? [])
    .map((o) => String(o ?? "").trim())
    .filter((o) => o.length > 0 && o !== "سایر" && o !== "سایر…" && o.toLowerCase() !== "other");
  if (raw.length >= 2) return raw.slice(0, 5);
  const hay = `${q.text ?? ""} ${q.context ?? ""}`;
  if (/تعطیل|تقویم|time\.ir|مناسبت|holiday/i.test(hay)) {
    return [
      "از جدول تعطیلات time.ir داخل سیستم",
      "فقط از فایل دستورالعمل",
      "از هر دو (time.ir + دستورالعمل)",
      "بدون تعطیل رسمی (فقط پنجشنبه/جمعه)",
    ];
  }
  if (/شب|جمعه|اضافه|مرخصی|موظف/.test(hay)) {
    return [
      "طبق متن دستورالعمل فایل",
      "طبق فایل خروجی نمونه",
      "ترکیب دستورالعمل + خروجی نمونه",
      "قوانین سادهٔ استاندارد HR",
    ];
  }
  if (/ستون|شیت|خروجی|ساختار|عنوان/.test(hay)) {
    return [
      "عین ساختار فایل خروجی نمونه",
      "طبق دستورالعمل (حتی اگر با نمونه فرق کند)",
      "اولویت با خروجی نمونه",
      "ساده‌سازی ستون‌ها در حد امکان",
    ];
  }
  if (/ورودی|فایل خام|نمونه|xlsx|اکسل/.test(hay)) {
    return [
      "همین فایل ورودی فعلی کافی است",
      "باید دقیقاً مثل خروجی نمونه باشد",
      "هر دو فایل را با هم در نظر بگیر",
      "فقط قوانین متنی مهم است",
    ];
  }
  if (raw.length === 1) {
    return [raw[0], "طبق دستورالعمل", "طبق خروجی نمونه", "هر دو با اولویت دستورالعمل"];
  }
  return [
    "طبق دستورالعمل",
    "طبق خروجی/ورودی نمونه",
    "هر دو با اولویت دستورالعمل",
    "تصمیم با ایجنت در حد معقول",
  ];
}

export function AgentClarificationQuestions({
  analysis,
  questions,
  onSubmit,
  className,
  variant = "form",
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherDraft, setOtherDraft] = useState<Record<string, string>>({});
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = useMemo(
    () => questions.every((q) => (answers[q.id] ?? "").trim().length > 0),
    [answers, questions]
  );

  function pickOption(qid: string, option: string) {
    setOtherOpen((prev) => ({ ...prev, [qid]: false }));
    setAnswers((prev) => ({ ...prev, [qid]: option }));
  }

  function openOther(qid: string) {
    setOtherOpen((prev) => ({ ...prev, [qid]: true }));
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[qid];
      return next;
    });
  }

  function commitOther(qid: string) {
    const text = (otherDraft[qid] ?? "").trim();
    if (!text) return;
    setAnswers((prev) => ({ ...prev, [qid]: text }));
  }

  async function handleSubmit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = Object.fromEntries(
        questions.map((q) => [q.id, (answers[q.id] ?? "").trim()])
      );
      await onSubmit(payload);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ثبت پاسخ‌ها ناموفق بود");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className={cn("rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-sm", className)}>
        <p className="font-medium text-brand-800">پاسخ‌ها ثبت شد — حالا می‌توانید ایجنت را تست کنید.</p>
      </div>
    );
  }

  if (variant === "chat") {
    return (
      <div
        className={cn("space-y-3", className)}
        data-ma-support="wizard-planning-questions"
      >
        {analysis?.trim() && (
          <div className="mr-auto max-w-[92%] rounded-2xl rounded-tr-md border border-stone-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-stone-700 shadow-sm">
            <p className="mb-1 text-[11px] font-semibold text-brand-700">تحلیل اولیه</p>
            <p>{analysis}</p>
          </div>
        )}
        {questions.map((q) => {
          const opts = resolveQuestionOptions(q);
          const chosen = answers[q.id];
          return (
            <div key={q.id} className="space-y-2">
              <div className="mr-auto max-w-[92%] rounded-2xl rounded-tr-md border border-stone-200 bg-stone-50/90 px-3.5 py-2.5 text-sm leading-relaxed text-stone-900 shadow-sm">
                <p className="font-medium">{q.text}</p>
                {q.context?.trim() && (
                  <p className="mt-1.5 text-xs text-stone-500">{q.context}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pr-1">
                {opts.map((opt) => {
                  const active = chosen === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      data-ma-support={`wizard-planning-option-${q.id}`}
                      onClick={() => pickOption(q.id, opt)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "border-brand-500 bg-brand-600 text-white"
                          : "border-stone-200 bg-white text-stone-700 hover:border-brand-300 hover:bg-brand-50"
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
                <button
                  type="button"
                  data-ma-support={`wizard-planning-other-${q.id}`}
                  onClick={() => openOther(q.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    otherOpen[q.id] || (chosen && !opts.includes(chosen))
                      ? "border-brand-500 bg-brand-50 text-brand-800"
                      : "border-dashed border-stone-300 bg-white text-stone-600 hover:border-brand-300"
                  )}
                >
                  {OTHER}
                </button>
              </div>
              {otherOpen[q.id] && (
                <div className="flex gap-2">
                  <input
                    data-ma-support={`wizard-planning-answer-${q.id}`}
                    value={otherDraft[q.id] ?? ""}
                    onChange={(e) =>
                      setOtherDraft((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitOther(q.id);
                      }
                    }}
                    placeholder="پاسخ خود را بنویسید…"
                    className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                  />
                  <Button type="button" className="h-9 shrink-0 px-3 text-xs" onClick={() => commitOther(q.id)}>
                    ثبت
                  </Button>
                </div>
              )}
              {chosen && !otherOpen[q.id] && (
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tl-md bg-brand-600 px-3.5 py-2 text-sm text-white">
                  {chosen}
                </div>
              )}
            </div>
          );
        })}
        {error && <p className="text-sm text-accent-red">{error}</p>}
        <Button
          type="button"
          className="w-full"
          data-ma-support="wizard-planning-submit"
          disabled={!allAnswered || submitting}
          onClick={handleSubmit}
        >
          {submitting ? <LoadingSpinner /> : null}
          ثبت پاسخ‌ها و شروع تست
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn("space-y-4", className)}
      data-ma-support="wizard-planning-questions"
    >
      {analysis?.trim() && (
        <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-3 text-xs leading-relaxed text-stone-600">
          <p className="mb-1 font-semibold text-stone-800">تحلیل اولیه</p>
          <p>{analysis}</p>
        </div>
      )}

      {questions.map((q) => {
        const opts = resolveQuestionOptions(q);
        const chosen = answers[q.id];
        return (
          <div
            key={q.id}
            className="rounded-xl border border-stone-200/80 bg-white p-4 shadow-sm"
          >
            <p className="text-sm font-medium leading-relaxed text-stone-900">{q.text}</p>
            {q.context?.trim() && (
              <span className="mt-2 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                {q.context}
              </span>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {opts.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => pickOption(q.id, opt)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    chosen === opt
                      ? "border-brand-500 bg-brand-600 text-white"
                      : "border-stone-200 bg-white hover:bg-brand-50"
                  )}
                >
                  {opt}
                </button>
              ))}
              <button
                type="button"
                onClick={() => openOther(q.id)}
                className="rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs"
              >
                {OTHER}
              </button>
            </div>
            {otherOpen[q.id] && (
              <textarea
                data-ma-support={`wizard-planning-answer-${q.id}`}
                value={otherDraft[q.id] ?? ""}
                onChange={(e) => {
                  setOtherDraft((prev) => ({ ...prev, [q.id]: e.target.value }));
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                }}
                rows={3}
                placeholder="پاسخ خود را بنویسید…"
                className="mt-3 w-full resize-y rounded-lg border border-surface-border px-3 py-2 text-sm"
              />
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <Button
        type="button"
        className="w-full"
        data-ma-support="wizard-planning-submit"
        disabled={!allAnswered || submitting}
        onClick={handleSubmit}
      >
        {submitting ? <LoadingSpinner /> : null}
        ثبت پاسخ‌ها و ادامه تست
      </Button>
    </div>
  );
}
