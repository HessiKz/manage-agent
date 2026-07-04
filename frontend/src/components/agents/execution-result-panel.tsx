"use client";

import { useEffect, useMemo, useRef } from "react";
import { FileText } from "lucide-react";
import { ChatMessageContent } from "@/components/agents/chat-message-content";
import type { ChatMessage } from "@/components/agents/chat-panel";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type Props = {
  messages?: ChatMessage[];
};

function actionLabelFromUser(userContent: string): string | undefined {
  const u = userContent.trim();
  if (!u) return undefined;
  if (u.startsWith("اقدام:")) return u.slice("اقدام:".length).trim();
  return u.length <= 80 ? u : undefined;
}

function resolveDisplay(messages: ChatMessage[]) {
  const loading =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    !messages[messages.length - 1].content.trim();

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !msg.content.trim()) continue;
    const prev = messages[i - 1];
    return {
      loading,
      actionLabel:
        prev?.role === "user" ? actionLabelFromUser(prev.content) : undefined,
      content: msg.content,
    };
  }

  return { loading, actionLabel: undefined, content: null as string | null };
}

/** Read-only execution output for worker / non-chat agents — no chat chrome. */
export function ExecutionResultPanel({ messages = [] }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const state = useMemo(() => resolveDisplay(messages), [messages]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state.content, state.loading]);

  if (state.loading && !state.content) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/50 px-6 py-14">
        <LoadingSpinner />
        <p className="mt-3 text-sm font-medium text-stone-700">در حال اجرا…</p>
        <p className="mt-1 text-xs text-stone-500">لطفاً چند لحظه صبر کنید</p>
      </div>
    );
  }

  if (!state.content) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/40 px-6 py-10 text-center">
        <FileText className="mx-auto h-9 w-9 text-stone-300" aria-hidden />
        <p className="mt-3 text-sm text-stone-600">هنوز خروجی‌ای ثبت نشده است.</p>
        <p className="mt-1 text-xs text-stone-500">
          اقدام را از بخش «اجرای ایجنت» بالا انتخاب کنید و دکمه اجرا را بزنید.
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-surface-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-stone-600">
          <FileText className="h-4 w-4 text-brand-600" aria-hidden />
          <span className="font-semibold text-stone-800">خروجی اجرا</span>
          {state.actionLabel ? (
            <>
              <span className="text-stone-300">·</span>
              <span>{state.actionLabel}</span>
            </>
          ) : null}
        </div>
        {state.loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-brand-700">
            <LoadingSpinner />
            به‌روزرسانی…
          </span>
        ) : null}
      </div>
      <div className="max-h-[min(60vh,32rem)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <ChatMessageContent content={state.content} variant="document" />
      </div>
    </div>
  );
}