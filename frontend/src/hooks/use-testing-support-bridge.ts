"use client";

import { useEffect } from "react";
import { sleepAbortable, throwIfSupportAborted } from "@/lib/support-abort";
import {
  hasSupportBridge,
  registerSupportBridge,
  runSupportBridge,
  waitForDomSelector,
  waitForSupportBridge,
} from "@/lib/support-automation-bridge";
import {
  fetchAgentBySlug,
  fetchAgents,
  approveAgentDashboard,
  fetchAgentDashboard,
  generateAgentDashboard,
} from "@/lib/api";
import { ensureAgentWidgetEnabled } from "@/lib/support-widget-plan-enable";
import { isWidgetStepSkipped } from "@/lib/support-user-choices";
import {
  isAgentValidationComplete,
  isPlanningAwaitingAnswers,
  maybeAutoResolvePlanning,
  maybeResolvePageBlockers,
  resolveVisiblePlanningOnPage,
} from "@/lib/support-testing-actions";
import { formatWaitClock, SUPPORT_WAIT_CHUNK_MS, waitUntilOrAskExtend } from "@/lib/support-wait-extend";
import {
  readCreatedAgentSlug,
  readStoredWizardCreatePayload,
  readWizardSlugFromUrl,
  rememberCreatedAgentSlug,
  shouldBlockWizardCreateWalk,
} from "@/lib/support-wizard-mission";
import type { ValidationReport } from "@/lib/agent-testing-phase";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import type { Agent } from "@/types";
import { patchRunState, wizardScopeKey } from "@/lib/run-state-client";

// M1.5 hook point 2: advance run state phase after each tool success.
function recordPhase(phase: string, lastTool?: string): void {
  const payload = lastTool ? { last_tool: lastTool, last_tool_success: true } : undefined;
  void patchRunState({ type: "wizard", key: wizardScopeKey() }, { phase, payload }).catch(
    () => undefined
  );
}

async function waitForDashboardReview(slug: string, ctx: SupportPlayerContext): Promise<Agent> {
  await waitUntilOrAskExtend(
    async () => {
      throwIfSupportAborted();
      await maybeResolvePageBlockers();
      let agent = await fetchAgentBySlug(slug);
      const resolved = await maybeAutoResolvePlanning(agent, ctx);
      if (resolved) agent = resolved;
      const v = agent.config_json?.validation as Record<string, string> | undefined;
      if (v?.state === "dashboard_review" || v?.current_phase === "dashboard_review") {
        return true;
      }
      if (isAgentValidationComplete(agent)) return true;
      if (v?.state === "running" || v?.state === "pending_auto") return true;
      return false;
    },
    {
      chunkMs: SUPPORT_WAIT_CHUNK_MS,
      pollMs: 2500,
      promptTitle: "طراحی پنل",
      promptMessage: "طراحی پنل ایجنت بیش از حد معمول طول کشید. بیشتر صبر کنیم؟",
      formatStatus: (sec) => `منتظر طراحی پنل… (${formatWaitClock(sec)})`,
    },
    ctx
  );
  return fetchAgentBySlug(slug);
}

async function waitForValidationComplete(slug: string, ctx: SupportPlayerContext) {
  await waitUntilOrAskExtend(
    async () => {
      throwIfSupportAborted();
      await maybeResolvePageBlockers();
      let agent = await fetchAgentBySlug(slug);
      const resolved = await maybeAutoResolvePlanning(agent, ctx);
      if (resolved) agent = resolved;
      if (isAgentValidationComplete(agent)) return true;
      const v = agent.config_json?.validation as Record<string, unknown> | undefined;
      if (agent.status === "error") {
        const failures = (v?.failures as { message?: string }[] | undefined) ?? [];
        throw new Error(failures[0]?.message ?? "تست خودکار ناموفق بود");
      }
      if (isPlanningAwaitingAnswers(agent.config_json?.validation as ValidationReport)) {
        await ctx.setStatus("پاسخ خودکار به سؤالات برنامه‌ریزی…");
      }
      return false;
    },
    {
      chunkMs: SUPPORT_WAIT_CHUNK_MS,
      pollMs: 2500,
      promptTitle: "تست خودکار",
      promptMessage: "تست خودکار ایجنت بیش از حد معمول طول کشید. بیشتر صبر کنیم؟",
      formatStatus: (sec) => `تست خودکار در حال اجرا… (${formatWaitClock(sec)})`,
    },
    ctx
  );
}

function validationOf(agent: Agent): Record<string, unknown> {
  return (agent.config_json?.validation ?? {}) as Record<string, unknown>;
}

function isTrainingPhase(agent: Agent): boolean {
  const v = validationOf(agent);
  if (v.training_completed === true) return false;
  if (v.state === "training" || v.current_phase === "training") return true;
  if (v.state === "pending" && agent.status === "deploying") return true;
  return false;
}

/** Only skip UI training when backend already recorded completion. */
function shouldSkipInteractiveTraining(agent: Agent): boolean {
  const v = validationOf(agent);
  if (v.training_completed === true) return true;
  if (agent.status === "active") return true;
  if (v.state === "dashboard_review" || v.current_phase === "dashboard_review") return true;
  if (v.state === "running" || v.state === "done") return true;
  return false;
}

async function waitForInteractiveTraining(slug: string, ctx: SupportPlayerContext) {
  await waitUntilOrAskExtend(
    async () => {
      throwIfSupportAborted();
      let agent: Agent;
      try {
        agent = await fetchAgentBySlug(slug);
      } catch {
        return false;
      }

      if (shouldSkipInteractiveTraining(agent)) {
        return true;
      }

      if (!isTrainingPhase(agent)) {
        return false;
      }

      const panel = document.querySelector('[data-ma-support="training-panel"]');
      const chatInput = document.querySelector('[data-ma-support="training-chat-input"]');
      return Boolean(panel && chatInput && hasSupportBridge("training.auto_finish"));
    },
    {
      chunkMs: SUPPORT_WAIT_CHUNK_MS,
      pollMs: 450,
      promptTitle: "آموزش تعاملی",
      promptMessage: "آماده شدن آموزش تعاملی بیش از حد معمول طول کشید. بیشتر صبر کنیم؟",
      formatStatus: (sec) => `منتظر آموزش تعاملی… (${formatWaitClock(sec)})`,
    },
    ctx
  );

  let agent = await fetchAgentBySlug(slug);
  if (shouldSkipInteractiveTraining(agent)) {
    return { agent, skipTraining: true as const };
  }
  return { agent, skipTraining: false as const };
}

function validationAlreadyRunning(agent: Agent): boolean {
  const v = validationOf(agent);
  return (
    v.state === "running" ||
    v.state === "pending_auto" ||
    v.state === "done"
  );
}

function dashboardAlreadyApproved(agent: Agent): boolean {
  const bucket = agent.config_json?.dashboard as { approved?: boolean } | undefined;
  return Boolean(bucket?.approved);
}

async function finishDashboardViaApi(agent: Agent, ctx: SupportPlayerContext): Promise<Agent> {
  if (dashboardAlreadyApproved(agent)) return agent;

  await ctx.setStatus("مرحله ۳ از ۴: آماده‌سازی پنل…");
  let dash = await fetchAgentDashboard(agent.id, true);

  const skipKpi = isWidgetStepSkipped("stat_cards");
  const needsKpi = !skipKpi;

  if (needsKpi) {
    try {
      await ensureAgentWidgetEnabled(agent.id, agent.slug, "stat_cards");
    } catch {
      /* best-effort — user may enable via choice bar */
    }
  }

  if (!dash.has_pending_draft && needsKpi) {
    await ctx.setStatus("مرحله ۳ از ۴: ساخت پیش‌نمایش پنل…");
    await generateAgentDashboard(agent.id, {
      widget_type: "stat_cards",
      prompt: `کارت‌های KPI برای ایجنت «${agent.name}»`,
      merge_with_existing: true,
    });
    dash = await fetchAgentDashboard(agent.id, true);
  }

  if (!dashboardAlreadyApproved(agent)) {
    await ctx.setStatus("مرحله ۴ از ۴: تأیید پنل و شروع تست خودکار");
    await approveAgentDashboard(agent.id);
  }

  return fetchAgentBySlug(agent.slug);
}

async function waitForDashboardPanelReady(slug: string, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    try {
      await waitForDomSelector('[data-ma-support="dashboard-panel"]', 8_000, 200);
      await waitForSupportBridge("dashboard.generate_widget", 8_000);
      return await fetchAgentBySlug(slug);
    } catch {
      const fresh = await fetchAgentBySlug(slug).catch(() => null);
      if (fresh?.status === "active") return fresh;
      await sleepAbortable(800);
    }
  }
  throw new Error("زمان انتظار برای بارگذاری پنل ایجنت به پایان رسید");
}

/** Prefer URL/session over payload — the model often invents the next slug (…-22) that was never created. */
export function resolveTestingSlug(payload: Record<string, unknown> | undefined): string {
  const fromUrl = readWizardSlugFromUrl();
  if (fromUrl) return fromUrl;
  const fromSession = readCreatedAgentSlug();
  if (fromSession) return fromSession;
  return String(payload?.agent_slug ?? "").trim();
}

async function agentExists(slug: string): Promise<Agent | null> {
  if (!slug) return null;
  try {
    return await fetchAgentBySlug(slug);
  } catch {
    return null;
  }
}

/**
 * Resolve a slug that actually exists. Never trust a hallucinated payload slug alone.
 */
export async function resolveExistingTestingSlug(
  payload: Record<string, unknown> | undefined
): Promise<{ slug: string; agent: Agent }> {
  const stored = readStoredWizardCreatePayload() ?? {};
  const nameHint = String(payload?.name ?? stored.name ?? "").trim();
  const candidates = [
    readWizardSlugFromUrl(),
    readCreatedAgentSlug(),
    String(payload?.agent_slug ?? "").trim(),
  ].filter(Boolean);
  // unique preserve order
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    ordered.push(c);
  }

  for (const slug of ordered) {
    const agent = await agentExists(slug);
    if (agent) {
      rememberCreatedAgentSlug(agent.slug);
      return { slug: agent.slug, agent };
    }
  }

  // Fallback: only when publish/testing already started — never pick a random agent on step 1.
  if (!shouldBlockWizardCreateWalk()) {
    const tried = ordered.join("، ") || "—";
    throw new Error(
      `ایجنت هنوز ذخیره نشده (امتحان‌شده: ${tried}). ویزارد را تا انتها برو — platform_create_agent نه continue.`
    );
  }

  try {
    const page = await fetchAgents({
      catalog_only: false,
      page_size: 30,
      ...(nameHint ? { search: nameHint } : {}),
    });
    const items = page.items ?? [];
    const byName = nameHint
      ? items.find((a) => a.name.trim() === nameHint) ??
        items.find((a) => a.name.includes(nameHint) || nameHint.includes(a.name))
      : undefined;
    const pick =
      byName ??
      items.find((a) => a.status === "deploying");
    if (pick) {
      rememberCreatedAgentSlug(pick.slug);
      return { slug: pick.slug, agent: pick };
    }
  } catch {
    /* fall through */
  }

  const tried = ordered.join("، ") || "—";
  throw new Error(
    `ایجنت پیدا نشد (امتحان‌شده: ${tried}). از ساخت دوباره خودداری کنید — بگویید «لیست ایجنت‌ها» یا اسلاگ درست را بدهید.`
  );
}

export function useTestingSupportBridge(): void {
  useEffect(() => {
    return registerSupportBridge("wizard.resolve_planning", async (_payload, ctx) => {
      await ctx.setStatus("پاسخ به سؤالات تحلیل عمیق…");
      const ok = await resolveVisiblePlanningOnPage(ctx);
      if (!ok) {
        throw new Error("سؤالات برنامه‌ریزی روی صفحه دیده نشد یا ثبت پاسخ ناموفق بود.");
      }
    });
  }, []);

  useEffect(() => {
    return registerSupportBridge("wizard.continue_testing", async (payload, ctx) => {
      await ctx.setStatus("یافتن ایجنت ذخیره‌شده (بدون ساخت جدید)…");
      const { slug: resolvedSlug, agent: existing } =
        await resolveExistingTestingSlug(payload);

      const outputSpec = String(payload?.output_format_spec ?? "").trim();
      const name = String(payload?.name ?? existing.name ?? "ایجنت");

      await ctx.setStatus(
        `ادامه تست «${name}» (\`${resolvedSlug}\`) — بدون بازگشت به مرحله ۱…`
      );
      let bootAgent = existing;
      const planningResolved = await maybeAutoResolvePlanning(bootAgent, ctx);
      if (planningResolved) bootAgent = planningResolved;

      await ctx.setStatus(`مرحله ۱ از ۴: منتظر آماده شدن آموزش تعاملی «${name}»…`);
      const trainingReady = await waitForInteractiveTraining(resolvedSlug, ctx);

      if (!trainingReady.skipTraining) {
        await ctx.setStatus(`مرحله ۱ از ۴: گفت‌وگوی آموزشی با «${name}»`);
        try {
          await runSupportBridge(
            "training.auto_finish",
            {
              agent_slug: resolvedSlug,
              output_format_spec:
                outputSpec ||
                "پاسخ کوتاه، ساختارمند و رسمی — با bullet در صورت نیاز.",
              name,
            },
            ctx
          );
        } catch (trainingErr) {
          const fresh = await fetchAgentBySlug(resolvedSlug);
          if (!shouldSkipInteractiveTraining(fresh)) {
            throw trainingErr;
          }
          await ctx.setStatus("آموزش از قبل تکمیل شده — ادامه با طراحی پنل…");
        }
      }
      recordPhase("training", "training.auto_finish");

      await ctx.setStatus("مرحله ۲ از ۴: منتظر طراحی پنل توسط سیستم…");
      let agent = await waitForDashboardReview(resolvedSlug, ctx);
      await ctx.wait(800);
      recordPhase("dashboard");

      if (validationAlreadyRunning(agent)) {
        await ctx.setStatus("تست خودکار در حال اجراست — منتظر پایان…");
        await waitForValidationComplete(resolvedSlug, ctx);
        recordPhase("complete", "continue_testing");
        await ctx.setStatus(`ایجنت «${agent.name}» آماده است`);
        return;
      }

      const onCreateWizard =
        typeof window !== "undefined" && window.location.pathname.startsWith("/agents/create");

      if (onCreateWizard || !document.querySelector('[data-ma-support="dashboard-panel"]')) {
        agent = await finishDashboardViaApi(agent, ctx);
      } else {
        await ctx.setStatus("مرحله ۳ از ۴: بارگذاری پنل برای ساخت ویجت…");
        agent = await waitForDashboardPanelReady(resolvedSlug);

        await ctx.setStatus("مرحله ۳ از ۴: ساخت ویجت KPI در پنل");
        if (!isWidgetStepSkipped("stat_cards")) {
          try {
            await ensureAgentWidgetEnabled(agent.id, agent.slug, "stat_cards");
          } catch {
            /* user choice flow may handle */
          }
          await runSupportBridge(
            "dashboard.generate_widget",
            {
              agent_id: agent.id,
              agent_slug: agent.slug,
              widget_type: "stat_cards",
              prompt: `کارت‌های KPI برای ایجنت «${agent.name}»`,
            },
            ctx
          );
        } else {
          await ctx.setStatus("مرحله ۳ از ۴: ساخت KPI رد شد — تأیید پنل…");
        }

        await ctx.wait(1200);
        await ctx.setStatus("مرحله ۴ از ۴: تأیید پنل و شروع تست خودکار");
        await waitForDomSelector('[data-ma-support="dashboard-approve"]');
        await waitForSupportBridge("dashboard.approve");
        await runSupportBridge("dashboard.approve", { agent_id: agent.id }, ctx);
      }

      await ctx.setStatus("مرحله ۴ از ۴: تست خودکار در حال اجراست — تا پایان صبر می‌کنم…");
      await waitForValidationComplete(resolvedSlug, ctx);
      recordPhase("complete", "continue_testing");
      await ctx.setStatus(`ایجنت «${agent.name}» آماده است`);
    });
  }, []);
}
