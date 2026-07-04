import { appConfirm } from "@/lib/app-dialog";
import { sleepAbortable, SupportUiAbortError, SupportUiBlockedError, throwIfSupportAborted } from "@/lib/support-abort";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import { tryRecoverVisibleBlockers } from "@/lib/support-auto-recovery";
import {
  shouldAttemptWizardFieldHeal,
  tryHealWizardValidationFromPage,
} from "@/lib/support-wizard-field-heal";
import { isWizardPlanningQuestionsVisible, resolveVisiblePlanningOnPage } from "@/lib/support-testing-actions";
import { readAppDialogMessage } from "@/lib/support-wizard-errors";
import { detectBlockers } from "@/lib/ui-snapshot";

/** Default wait before asking user to extend or stop (1:30). */
export const SUPPORT_WAIT_CHUNK_MS = 90_000;

export type WaitExtendOptions = {
  /** Time before asking the user to extend (default 1:30). */
  chunkMs?: number;
  pollMs?: number;
  promptTitle: string;
  promptMessage: string;
  continueLabel?: string;
  stopLabel?: string;
  /** Push status to support overlay every N seconds while waiting. */
  statusEverySec?: number;
  formatStatus?: (elapsedSec: number) => string;
  /** After this many ms with the same visible blocker, stop waiting and surface the error. */
  blockerStuckMs?: number;
};

export function formatWaitClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Poll until `test` is true. After each chunk, ask the user whether to keep waiting.
 */
export async function waitUntilOrAskExtend(
  test: () => boolean | Promise<boolean>,
  opts: WaitExtendOptions,
  ctx?: SupportPlayerContext | null
): Promise<void> {
  const chunkMs = opts.chunkMs ?? SUPPORT_WAIT_CHUNK_MS;
  const pollMs = opts.pollMs ?? 400;
  const statusEverySec = opts.statusEverySec ?? 30;
  const blockerStuckMs = opts.blockerStuckMs ?? 45_000;
  const globalStart = Date.now();
  let lastStatusAt = 0;
  let stuckBlocker: string | null = null;
  let stuckSince = 0;
  let planningStuckSince = 0;

  while (true) {
    throwIfSupportAborted();
    const chunkStart = Date.now();

    while (Date.now() - chunkStart < chunkMs) {
      throwIfSupportAborted();

      if (
        typeof window !== "undefined" &&
        window.location.pathname.startsWith("/agents/create") &&
        (shouldAttemptWizardFieldHeal() || readAppDialogMessage())
      ) {
        if (await tryHealWizardValidationFromPage(ctx)) {
          if (await Promise.resolve(test())) return;
        }
      }

      const blocker =
        readAppDialogMessage() || detectBlockers()[0]?.text || null;
      if (blocker) {
        if (blocker !== stuckBlocker) {
          stuckBlocker = blocker;
          stuckSince = Date.now();
        }
        const recovered = await tryRecoverVisibleBlockers(ctx);
        if (recovered) {
          stuckBlocker = null;
          if (await Promise.resolve(test())) return;
        } else if (Date.now() - stuckSince >= blockerStuckMs) {
          throw new SupportUiBlockedError(
            `${blocker}\n\nرفع خودکار ناموفق بود — لطفاً یکی از گزینه‌های پیشنهادی را بزنید.`
          );
        } else if (ctx) {
          await ctx.setStatus("در حال رفع خطا…");
        }
      } else {
        stuckBlocker = null;
      }

      if (isWizardPlanningQuestionsVisible()) {
        if (ctx) await ctx.setStatus("پاسخ به سؤالات تحلیل عمیق…");
        const resolved = await resolveVisiblePlanningOnPage(ctx);
        if (resolved) {
          planningStuckSince = 0;
          if (await Promise.resolve(test())) return;
        } else if (planningStuckSince && Date.now() - planningStuckSince >= blockerStuckMs) {
          throw new SupportUiBlockedError(
            "سؤالات برنامه‌ریزی تست هنوز باز است و پاسخ خودکار ناموفق بود.\n\n" +
              "لطفاً یکی از گزینه‌ها را بزنید یا در چت بگویید چه پاسخی بدهم."
          );
        }
        if (!planningStuckSince) planningStuckSince = Date.now();
      } else {
        planningStuckSince = 0;
      }

      if (await Promise.resolve(test())) return;

      const elapsedSec = Math.floor((Date.now() - globalStart) / 1000);
      if (
        ctx &&
        opts.formatStatus &&
        elapsedSec > 0 &&
        elapsedSec - lastStatusAt >= statusEverySec
      ) {
        lastStatusAt = elapsedSec;
        await ctx.setStatus(opts.formatStatus(elapsedSec));
      }

      if (ctx) await ctx.wait(pollMs);
      else await sleepAbortable(pollMs);
    }

    if (await Promise.resolve(test())) return;

    const elapsedMin = Math.max(1, Math.round((Date.now() - globalStart) / 60_000));
    const ok = await appConfirm({
      title: opts.promptTitle,
      message: `${opts.promptMessage}\n\n(${elapsedMin} دقیقه صبر کردیم)`,
      confirmLabel: opts.continueLabel ?? "بله، ادامه بده",
      cancelLabel: opts.stopLabel ?? "توقف",
    });

    if (!ok) {
      throw new SupportUiAbortError("کاربر انتظار را متوقف کرد.");
    }

    if (ctx) await ctx.setStatus("ادامه انتظار…");
    lastStatusAt = Math.floor((Date.now() - globalStart) / 1000);
  }
}
