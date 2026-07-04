"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

export type PlanningQuestion = {
  id: string;
  text: string;
  context?: string;
};

type Props = {
  analysis?: string;
  questions: PlanningQuestion[];
  onSubmit: (answers: Record<string, string>) => Promise<void>;
  className?: string;
};

export function AgentClarificationQuestions({
  analysis,
  questions,
  onSubmit,
  className,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = useMemo(
    () => questions.every((q) => (answers[q.id] ?? "").trim().length > 0),
    [answers, questions]
  );

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
        <p className="font-medium text-brand-800">پاسخ‌ها ثبت شد، ادامه تست…</p>
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

      {questions.map((q) => (
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
          <textarea
            data-ma-support={`wizard-planning-answer-${q.id}`}
            value={answers[q.id] ?? ""}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
            }
            rows={3}
            placeholder="پاسخ خود را بنویسید…"
            className="mt-3 w-full resize-y rounded-lg border border-surface-border px-3 py-2 text-sm"
          />
        </div>
      ))}

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