import { fetchAgentBySlug } from "@/lib/api";
import type { ValidationReport } from "@/lib/agent-testing-phase";
import { tryRecoverWizardBlocker } from "@/lib/support-wizard-recovery";
import { tryAutoResolveSupportError } from "@/lib/support-auto-recovery";
import { detectBlockers } from "@/lib/ui-snapshot";
import { readCreatedAgentSlug } from "@/lib/support-wizard-mission";
import { readAppDialogMessage } from "@/lib/support-wizard-errors";
import { sleepAbortable, throwIfSupportAborted } from "@/lib/support-abort";
import {
  clickElementVisually,
  typeIntoFormFieldVisually,
} from "@/lib/support-dom-typing";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import type { Agent } from "@/types";

type PlanningQuestion = { id: string; text?: string };

const PLANNING_QUESTIONS_WAIT_MS = 180_000;
const PLANNING_POLL_MS = 350;

function validationOf(agent: Agent): ValidationReport {
  return (agent.config_json?.validation ?? {}) as ValidationReport;
}

export function isPlanningAwaitingAnswers(
  validation: ValidationReport | null | undefined
): boolean {
  return Boolean(
    validation?.planning?.awaiting_answers &&
      (validation.planning?.questions?.length ?? 0) > 0
  );
}

/** True only when automated validation finished — not merely agent.status active. */
export function isAgentValidationComplete(agent: Agent): boolean {
  const v = validationOf(agent);
  if (isPlanningAwaitingAnswers(v)) return false;
  if (agent.status === "error") return false;
  if (v.state === "running" || v.state === "pending_auto") return false;
  if (v.current_phase === "planning" && !v.planning?.answers) return false;
  return v.state === "done";
}

export function isWizardTestingDomComplete(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector('[data-ma-support="wizard-testing-complete"]'));
}

export function isWizardPlanningQuestionsVisible(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector('[data-ma-support="wizard-planning-questions"]'));
}

export function defaultPlanningAnswer(questionText?: string): string {
  const q = (questionText ?? "").toLowerCase();
  if (/tone|لحن|formal|professional|رسمی/i.test(q)) {
    return "لحن رسمی و حرفه‌ای — مطابق دستورالعمل ایجنت.";
  }
  if (/scope|محدوده|outside|خارج/i.test(q)) {
    return "فقط در محدوده عملیات تعریف‌شده پاسخ بده؛ خارج از آن محترمانه رد کن.";
  }
  if (/tool|api|ابزار/i.test(q)) {
    return "فقط ابزارها و APIهای فعال در تنظیمات ایجنت — در غیر این صورت راهنمایی یا رد مؤدبانه.";
  }
  if (/clarif|سؤال|ask|پرس/i.test(q)) {
    return "بله — وقتی اطلاعات کافی نیست ابتدا سؤال روشن‌کننده بپرس.";
  }
  return "تأیید می‌کنم — طبق دستورالعمل و تنظیمات فعلی ایجنت عمل کن.";
}

async function waitForPlanningQuestionsVisible(
  timeoutMs = PLANNING_QUESTIONS_WAIT_MS
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    if (isWizardPlanningQuestionsVisible()) return true;
    await sleepAbortable(PLANNING_POLL_MS);
  }
  return isWizardPlanningQuestionsVisible();
}

async function waitForSubmitEnabled(timeoutMs = 15_000): Promise<HTMLButtonElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    const btn = document.querySelector(
      '[data-ma-support="wizard-planning-submit"]'
    ) as HTMLButtonElement | null;
    if (btn && !btn.disabled) return btn;
    await sleepAbortable(120);
  }
  return null;
}

/** Fill planning form visibly (char-by-char) and click submit — never silent API. */
export async function submitPlanningViaDom(
  answers: Record<string, string>,
  ctx?: SupportPlayerContext | null
): Promise<boolean> {
  if (!(await waitForPlanningQuestionsVisible())) return false;
  if (!isWizardPlanningQuestionsVisible()) return false;

  const panel = document.querySelector('[data-ma-support="wizard-planning-questions"]');
  panel?.scrollIntoView({
    behavior: typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
  await sleepAbortable(400);

  if (ctx) {
    await ctx.setStatus("پاسخ به سؤالات تحلیل عمیق…");
    await ctx.highlight('[data-ma-support="wizard-planning-questions"]');
  }

  const entries = Object.entries(answers);
  for (let i = 0; i < entries.length; i++) {
    const [id, text] = entries[i];
    const el = document.querySelector(
      `[data-ma-support="wizard-planning-answer-${id}"]`
    ) as HTMLTextAreaElement | null;
    if (!el) continue;
    if (ctx) {
      await ctx.setStatus(`سؤال ${i + 1} از ${entries.length} — در حال نوشتن پاسخ…`);
    }
    await typeIntoFormFieldVisually(el, text, ctx);
  }

  const btn = await waitForSubmitEnabled();
  if (!btn) return false;

  if (ctx) {
    await ctx.setStatus("ثبت پاسخ‌ها و ادامه تست…");
  }
  await clickElementVisually(btn, ctx);
  await sleepAbortable(500);
  return true;
}

async function waitForPlanningResolved(
  slug: string,
  timeoutMs = 60_000
): Promise<Agent | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    await sleepAbortable(500);
    const fresh = await fetchAgentBySlug(slug);
    if (!isPlanningAwaitingAnswers(validationOf(fresh))) {
      return fresh;
    }
  }
  return null;
}

/** Auto-answer planning via visible UI typing (never silent API). */
export async function maybeAutoResolvePlanning(
  agent: Agent,
  ctx?: SupportPlayerContext | null
): Promise<Agent | null> {
  const v = validationOf(agent);
  const planning = v.planning;

  if (!planning?.awaiting_answers || !planning.questions?.length) {
    return null;
  }

  const answers: Record<string, string> = {};
  for (const q of planning.questions) {
    answers[q.id] = defaultPlanningAnswer(q.text);
  }

  const submitted = await submitPlanningViaDom(answers, ctx);
  if (!submitted) return null;

  return waitForPlanningResolved(agent.slug);
}

export async function resolveVisiblePlanningOnPage(
  ctx?: SupportPlayerContext | null
): Promise<boolean> {
  const slug = readCreatedAgentSlug();
  if (!slug) return false;
  try {
    const agent = await fetchAgentBySlug(slug);
    const v = validationOf(agent);
    if (!isPlanningAwaitingAnswers(v)) return true;
    const resolved = await maybeAutoResolvePlanning(agent, ctx);
    return Boolean(resolved);
  } catch {
    return false;
  }
}

export async function maybeResolvePageBlockers(): Promise<boolean> {
  const msg = readAppDialogMessage() || detectBlockers()[0]?.text;
  if (!msg) return false;
  if (await tryRecoverWizardBlocker(null, msg)) return true;
  return tryAutoResolveSupportError(msg, null);
}

export async function refreshAgentIfChanged(
  slug: string,
  previous: Agent
): Promise<Agent> {
  const next = await fetchAgentBySlug(slug);
  if (JSON.stringify(validationOf(next)) !== JSON.stringify(validationOf(previous))) {
    return next;
  }
  return previous;
}
