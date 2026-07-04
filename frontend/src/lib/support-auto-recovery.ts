import { fetchAgentBySlug } from "@/lib/api";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import { ensureAgentWidgetEnabled } from "@/lib/support-widget-plan-enable";
import { readCreatedAgentSlug } from "@/lib/support-wizard-mission";
import {
  dismissAppDialogIfOpen,
  readAppDialogMessage,
} from "@/lib/support-wizard-errors";
import { shouldAttemptWizardFieldHeal, tryHealWizardValidationFromPage } from "@/lib/support-wizard-field-heal";
import { tryRecoverWizardBlocker } from "@/lib/support-wizard-recovery";
import { detectBlockers } from "@/lib/ui-snapshot";
import {
  clearWidgetStepSkip,
  parseDisabledWidgetFromError,
} from "@/lib/support-user-choices";

function readVisibleBlockerMessage(): string | null {
  return readAppDialogMessage() || detectBlockers()[0]?.text || null;
}

/** Attempt automatic fix for known support errors (widget, permissions, dialogs). */
export async function tryAutoResolveSupportError(
  message: string,
  ctx?: SupportPlayerContext | null
): Promise<boolean> {
  const text = message.trim();
  if (!text) return false;

  const widgetKind = parseDisabledWidgetFromError(text);
  if (widgetKind) {
    const slug = readCreatedAgentSlug();
    if (slug) {
      try {
        const agent = await fetchAgentBySlug(slug);
        await ensureAgentWidgetEnabled(agent.id, slug, widgetKind);
        clearWidgetStepSkip(widgetKind);
        await ctx?.setStatus(`ویجت را فعال کردم — ادامه می‌دهم…`);
        await dismissAppDialogIfOpen();
        return true;
      } catch {
        /* API or network — try other paths */
      }
    }
  }

  if (await tryRecoverWizardBlocker(ctx ?? null, text)) {
    await ctx?.setStatus("مانع UI برطرف شد — ادامه…");
    return true;
  }

  if (readAppDialogMessage()) {
    await dismissAppDialogIfOpen();
        await ctx?.wait(280);
    if (!readVisibleBlockerMessage()) return true;
  }

  return false;
}

/** Poll-time recovery: read current blocker from DOM and try to fix it. */
export async function tryRecoverVisibleBlockers(
  ctx?: SupportPlayerContext | null
): Promise<boolean> {
  if (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/agents/create") &&
    shouldAttemptWizardFieldHeal()
  ) {
    if (await tryHealWizardValidationFromPage(ctx)) {
      await ctx?.setStatus("فیلدهای ویزارد تکمیل شد — ادامه…");
      return true;
    }
  }
  const msg = readVisibleBlockerMessage();
  if (!msg) return false;
  return tryAutoResolveSupportError(msg, ctx);
}
