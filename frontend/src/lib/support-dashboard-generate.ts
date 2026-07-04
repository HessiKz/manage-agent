import {
  fetchAgentDashboard,
  generateAgentDashboard,
  type DashboardGenerateResult,
  type DashboardWidgetKind,
} from "@/lib/api";
import { sleepAbortable, throwIfSupportAborted } from "@/lib/support-abort";
import { SupportTimeoutError } from "@/lib/support-timeout";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import { tryAutoResolveSupportError } from "@/lib/support-auto-recovery";
import { humanizeSupportError } from "@/lib/support-error-text";

export const SUPPORT_DASHBOARD_GENERATE_MS = 90_000;
export const SUPPORT_DRAFT_POLL_MS = 20_000;

export async function waitForDashboardDraft(
  agentId: string,
  timeoutMs: number
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    const live = await fetchAgentDashboard(agentId, false);
    if (live.has_pending_draft) return true;
    await sleepAbortable(800);
  }
  return false;
}

export async function generateDashboardWithGuard(
  agentId: string,
  payload: {
    prompt?: string;
    widget_type?: DashboardWidgetKind;
    merge_with_existing?: boolean;
  },
  ctx: SupportPlayerContext
): Promise<DashboardGenerateResult> {
  const controller = new AbortController();
  let elapsed = 0;
  const tick = setInterval(() => {
    elapsed += 5;
    void ctx.setStatus(`در حال ساخت ویجت با AI… (${elapsed}s)`);
  }, 5000);

  const abortTimer = setTimeout(() => controller.abort(), SUPPORT_DASHBOARD_GENERATE_MS);

  try {
    return await generateAgentDashboard(agentId, payload, { signal: controller.signal });
  } catch (e) {
    const message = humanizeSupportError(e);
    const fixed = await tryAutoResolveSupportError(message, ctx);
    if (fixed && !controller.signal.aborted) {
      return generateAgentDashboard(agentId, payload, { signal: controller.signal });
    }
    const aborted =
      controller.signal.aborted ||
      (e instanceof Error &&
        (e.name === "CanceledError" || e.message.includes("aborted") || e.message.includes("canceled")));
    if (aborted) {
      void ctx.setStatus("زمان API تمام شد — بررسی پیش‌نویس ذخیره‌شده…");
      const hasDraft = await waitForDashboardDraft(agentId, SUPPORT_DRAFT_POLL_MS);
      if (hasDraft) {
        const draft = await fetchAgentDashboard(agentId, true);
        return {
          agent_id: agentId,
          has_draft: true,
          preview_summary: "پیش‌نویس ویجت ذخیره شد (بازیابی پس از تأخیر شبکه).",
          widgets_added: [],
          widgets_modified: [],
          draft: (draft as unknown as Record<string, unknown>) ?? {},
        };
      }
      throw new SupportTimeoutError(
        "ساخت ویجت بیش از حد طول کشید — دوباره تلاش کنید یا دستور «توقف» بزنید."
      );
    }
    throw e;
  } finally {
    clearInterval(tick);
    clearTimeout(abortTimer);
  }
}

export async function waitForWidgetBuilderPreview(timeoutMs = 95_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    const preview = document.querySelector('[data-ma-support="widget-builder-preview"]');
    const generating = document.querySelector('[data-ma-support="widget-builder-generating"]');
    const err = document.querySelector('[data-ma-support="widget-builder-error"]');
    if (preview && !generating) return;
    if (err?.textContent?.trim()) {
      throw new Error(err.textContent.trim());
    }
    await sleepAbortable(350);
  }
  throw new SupportTimeoutError("پیش‌نمایش ویجت در زمان مقرر آماده نشد.");
}

/** Wait until the page-level auto_generate overlay is gone (or timeout). */
export async function waitForGeneratingOverlayGone(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    const overlay = document.querySelector('[data-ma-support="widget-auto-generating"]');
    if (!overlay) return;
    await sleepAbortable(300);
  }
}

export async function finishWidgetGeneration(
  agentId: string,
  ctx: SupportPlayerContext
): Promise<void> {
  const ok = await waitForDashboardDraft(agentId, 45_000);
  if (!ok) {
    throw new SupportTimeoutError("پیش‌نویس ویجت ذخیره نشد — لطفاً دوباره تلاش کنید.");
  }
  await ctx.setStatus("پیش‌نویس ویجت آماده است");
}
