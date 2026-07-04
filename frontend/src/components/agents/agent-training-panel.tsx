"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  registerSupportBridge,
  waitForDomSelector,
} from "@/lib/support-automation-bridge";
import {
  readLatestTrainingAssistantReply,
  runVisibleTrainingChat,
  waitForTrainingAssistantReply,
} from "@/lib/support-training-auto-finish";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapabilityAwarePanel } from "@/components/agents/capability-aware-panel";
import type { ChatExchange, ChatMessage } from "@/components/agents/chat-panel";
import {
  completeAgentTraining,
  fetchAgentActions,
  fetchAgentFiles,
  fetchAgentLinks,
  fetchAgentTemplates,
  runAgentAction,
  uploadAgentFile,
} from "@/lib/api";
import { handleApiError } from "@/lib/api-error-handler";
import {
  buildTrainingAutoFinishPlan,
  buildTrainingProgressSteps,
  buildTrainingSuggestedPrompts,
} from "@/lib/agent-training-scenarios";
import { sampleVariablesForAction } from "@/lib/agent-test-fixtures";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import { cn } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { Agent } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type Props = {
  agent: Agent;
  onCompleted?: () => void;
};

function hasDialogue(messages: ChatMessage[]): boolean {
  return (
    messages.some((m) => m.role === "user") &&
    messages.some((m) => m.role === "assistant" && m.content.trim().length > 0)
  );
}

function appendExchange(
  messages: ChatMessage[],
  user: string,
  assistant: string
): ChatMessage[] {
  const last = messages[messages.length - 1];
  const prev = messages[messages.length - 2];
  if (
    last?.role === "assistant" &&
    !last.content.trim() &&
    prev?.role === "user" &&
    prev.content === user
  ) {
    return [...messages.slice(0, -1), { role: "assistant", content: assistant }];
  }
  return [...messages, { role: "user", content: user }, { role: "assistant", content: assistant }];
}

function sanitizeTrainingMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.content.trim().length > 0);
}

function TrainingProgressBar({
  steps,
}: {
  steps: ReturnType<typeof buildTrainingProgressSteps>;
}) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={cn(
            "rounded-xl border px-2 py-2.5 text-center text-xs font-medium transition-colors",
            step.status === "done" && "border-brand-200 bg-brand-50 text-brand-800",
            step.status === "current" && "border-brand-300 bg-white text-stone-900 shadow-sm",
            step.status === "pending" && "border-stone-100 bg-stone-50/80 text-stone-400"
          )}
        >
          <span className="mb-1 block text-[10px] font-bold text-stone-400">{index + 1}</span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

export function AgentTrainingPanel({ agent, onCompleted }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);
  const finishRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const messagesRef = useRef(messages);
  const notesRef = useRef(notes);
  messagesRef.current = messages;
  notesRef.current = notes;

  const { data: actions = [] } = useQuery({
    queryKey: ["agent-actions", agent.id],
    queryFn: () => fetchAgentActions(agent.id),
    enabled: Boolean(agent.capabilities.actions_enabled),
  });

  const { data: links = [] } = useQuery({
    queryKey: ["agent-links", agent.id],
    queryFn: () => fetchAgentLinks(agent.id),
    enabled: Boolean(
      agent.capabilities.supervisor_enabled || agent.capabilities.can_call_agents
    ),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["agent-templates", agent.id],
    queryFn: () => fetchAgentTemplates(agent.id),
    enabled: Boolean(agent.capabilities.templates_enabled),
  });

  const { data: files = [], isSuccess: filesReady } = useQuery({
    queryKey: ["agent-files", agent.id],
    queryFn: () => fetchAgentFiles(agent.id),
  });

  const scenarioCtx = useMemo(
    () => ({ links, actions, templates }),
    [links, actions, templates]
  );

  const suggestedPrompts = useMemo(
    () => buildTrainingSuggestedPrompts(agent, scenarioCtx),
    [agent, scenarioCtx]
  );
  const primaryPrompt = suggestedPrompts[0];
  const secondaryPrompts = suggestedPrompts.slice(1);

  const initialFileCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (filesReady && initialFileCountRef.current === null) {
      initialFileCountRef.current = files.length;
    }
  }, [filesReady, files.length]);

  const uploadedInSession =
    initialFileCountRef.current !== null && files.length > initialFileCountRef.current;

  const hasUserTurn = messages.some((m) => m.role === "user");
  const hasAssistantReply = messages.some(
    (m) => m.role === "assistant" && m.content.trim().length > 0
  );
  const canFinish = hasDialogue(messages) || uploadedInSession;

  const progressSteps = useMemo(
    () =>
      buildTrainingProgressSteps({
        hasUserTurn,
        hasAssistantReply,
        canFinish,
      }),
    [hasUserTurn, hasAssistantReply, canFinish]
  );

  const handleChatExchange = useCallback((exchange: ChatExchange) => {
    setMessages((prev) => appendExchange(prev, exchange.user, exchange.assistant));
  }, []);

  const handleActionRunStart = useCallback((userLine: string) => {
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userLine },
      { role: "assistant", content: "" },
    ]);
  }, []);

  useEffect(() => {
    return registerSupportBridge("training.auto_finish", async (payload, ctx) => {
      const plan = buildTrainingAutoFinishPlan(
        agent,
        scenarioCtx,
        String(payload?.output_format_spec ?? "").trim() ||
          "پاسخ کوتاه، ساختارمند و رسمی — با bullet در صورت نیاز."
      );

      await waitForDomSelector('[data-ma-support="training-panel"]', 60_000);
      await ctx.highlight('[data-ma-support="training-panel"]');

      if (plan.resolveUpload) {
        await ctx.setStatus(`آپلود فایل نمونه (${plan.uploadLabel ?? "فایل"})…`);
        const file = await plan.resolveUpload();
        await uploadAgentFile(agent.id, file);
        await ctx.wait(500);
      }

      if (
        agent.capabilities.actions_enabled &&
        !agent.capabilities.chat_enabled &&
        actions[0]
      ) {
        await ctx.setStatus(`اجرای اقدام تست: ${actions[0].label}`);
        const res = await runAgentAction(
          agent.id,
          actions[0].slug,
          sampleVariablesForAction(actions[0])
        );
        const out = formatAssistantOutput(res.output ?? "");
        const exchange: ChatMessage[] = [
          { role: "user", content: plan.prompt },
          { role: "assistant", content: out },
        ];
        messagesRef.current = exchange;
        setMessages(exchange);
      } else {
        const userLine = plan.prompt;
        await waitForDomSelector('[data-ma-support="training-chat-input"]', 30_000);
        await ctx.highlight('[data-ma-support="training-chat-input"]');
        await ctx.typeIntoElement('[data-ma-support="training-chat-input"]', userLine);
        await ctx.wait(280);

        const sendBtn = document.querySelector(
          '[data-ma-support="training-chat-send"]'
        ) as HTMLButtonElement | null;

        if (sendBtn && !sendBtn.disabled) {
          await ctx.click('[data-ma-support="training-chat-send"]');
          await ctx.setStatus("منتظر پاسخ ایجنت در پیش‌نمایش…");
          await waitForTrainingAssistantReply();
          const assistantReply = readLatestTrainingAssistantReply();
          if (assistantReply) {
            messagesRef.current = [
              { role: "user", content: userLine },
              { role: "assistant", content: assistantReply },
            ];
          }
        } else {
          await runVisibleTrainingChat(
            agent.id,
            userLine,
            setMessages,
            messagesRef,
            ctx
          );
        }
      }

      const assistantMsg = messagesRef.current.find(
        (m) => m.role === "assistant" && m.content.trim().length > 0
      );
      if (!assistantMsg) {
        throw new Error("پیش‌نمایش کامل نشد — پاسخ ایجنت دریافت نشد");
      }

      await ctx.highlight('[data-ma-support="training-notes"]');
      notesRef.current = plan.formatNotes;
      setNotes(plan.formatNotes);
      await ctx.typeIntoElement('[data-ma-support="training-notes"]', plan.formatNotes);

      await ctx.setStatus("ذخیره پیش‌نمایش و طراحی پنل");
      await ctx.highlight('[data-ma-support="training-finish"]');
      await ctx.wait(400);
      await finishRef.current();
    });
  }, [agent, scenarioCtx, actions]);

  async function finishTraining() {
    let msgs = sanitizeTrainingMessages([...messagesRef.current]);
    if (!hasDialogue(msgs) && files.length > 0) {
      const names = files
        .slice(0, 5)
        .map((f) => f.filename)
        .join("، ");
      msgs = [
        {
          role: "user",
          content: `تست آپلود: ${files.length} فایل پیوست شد${names ? ` (${names})` : ""}.`,
        },
        {
          role: "assistant",
          content:
            "فایل‌ها دریافت و در workspace ثبت شدند. آماده پردازش مطابق سیاست فایل ایجنت.",
        },
      ];
    }
    if (!hasDialogue(msgs)) return;

    setSaving(true);
    setError(null);
    try {
      await completeAgentTraining(agent.id, {
        messages: msgs,
        notes: notesRef.current.trim() || undefined,
      });
      onCompleted?.();
    } catch (e: unknown) {
      const apiErr = handleApiError(e, {
        event: "agent.training.complete",
        toast: true,
        toastTitle: "خطا در ذخیره پیش‌نمایش",
      });
      setError(apiErr.message);
    } finally {
      setSaving(false);
    }
  }

  finishRef.current = finishTraining;

  return (
    <div data-ma-support="training-panel">
      <Stagger className="space-y-4" replayOnRoute>
        <StaggerItem variant="fadeIn">
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3 text-sm leading-relaxed text-stone-700">
            <p className="font-semibold text-stone-900">ایجنت آماده است — یک بار امتحانش کنید</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-stone-600">
              <li>
                <span className="font-medium text-stone-800">چه کار کنید:</span> یک سؤال نمونه
                بپرسید یا فایل را از دکمه پیوست چت بفرستید.
              </li>
              <li>
                <span className="font-medium text-stone-800">چه انتظاری داشته باشید:</span> پاسخ
                بر اساس تنظیمات ویزارد است — اینجا فقط شکل و لحن را تأیید می‌کنید.
              </li>
              <li>
                <span className="font-medium text-stone-800">چه زمانی ادامه دهید:</span> وقتی
                پاسخ مناسب بود، دکمه پایین را بزنید تا پنل ساخته شود.
              </li>
            </ul>
          </div>
        </StaggerItem>

        <StaggerItem variant="slideUp">
          <TrainingProgressBar steps={progressSteps} />
        </StaggerItem>

        {primaryPrompt && (
          <StaggerItem variant="slideUp">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="h-9 px-4 text-sm"
                onClick={() => setChatPrefill(primaryPrompt.prompt)}
              >
                <Sparkles className="h-4 w-4" />
                سؤال نمونه
              </Button>
              {secondaryPrompts.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setChatPrefill(s.prompt)}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-brand-200 hover:bg-brand-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </StaggerItem>
        )}

        <StaggerItem variant="scaleIn">
          <CapabilityAwarePanel
            agent={agent}
            variant="full"
            trainingMode
            trainingLayout="split"
            hideTemplatePicker
            chatAutomationPrefix="training-chat"
            chatMessages={messages}
            onChatMessagesChange={setMessages}
            onChatExchange={handleChatExchange}
            onActionRunStart={handleActionRunStart}
            initialMessage={chatPrefill}
          />
        </StaggerItem>

        <StaggerItem variant="slideUp">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-600">
              یادداشت اختیاری — اگر می‌خواهید فرمت پاسخ را دقیق‌تر مشخص کنید
            </span>
            <textarea
              data-ma-support="training-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="مثلاً: پاسخ با عنوان شروع شود، سه bullet داشته باشد، لحن رسمی باشد."
              className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </StaggerItem>

        {error && (
          <StaggerItem variant="fadeIn">
            <p className="rounded-xl border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-sm text-accent-red">
              {error}
            </p>
          </StaggerItem>
        )}

        <StaggerItem variant="scaleIn">
          <Button
            className="w-full"
            data-ma-support="training-finish"
            disabled={!canFinish || saving}
            onClick={finishTraining}
          >
            {saving ? (
              <>
                <LoadingSpinner />
                در حال ذخیره…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                پاسخ مناسب بود — ادامه به تست خودکار
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-xs text-stone-500">
            {canFinish
              ? "بعد از تأیید، تست خودکار اجرا می‌شود. ویجت پنل را بعداً از تب «پنل ایجنت» اضافه کنید."
              : "حداقل یک گفتگو، اجرای اقدام، یا آپلود فایل لازم است."}
          </p>
        </StaggerItem>
      </Stagger>
    </div>
  );
}