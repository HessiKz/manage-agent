/** Gate + delegate wizard field heal to the create-page bridge (React setForm). */

import { hasSupportBridge, runSupportBridge } from "@/lib/support-automation-bridge";
import { sleepAbortable, throwIfSupportAborted } from "@/lib/support-abort";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import {
  dismissAppDialogIfOpen,
  readActiveWizardStepIndex,
  readAppDialogMessage,
  readWizardNameError,
} from "@/lib/support-wizard-errors";
import { runWizardFieldHeal } from "@/lib/support-wizard-recovery";
import { readWizardFormSnapshot } from "@/lib/support-wizard-mission";
import { clickElementVisually } from "@/lib/support-dom-typing";

const SUPPORT_WIZARD_NAME_KEY = "ma_support_wizard_agent_name";
const HEAL_COOLDOWN_MS = 2_500;
let lastHealAt = 0;

export function setSupportWizardAgentName(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed.length >= 2) {
      sessionStorage.setItem(SUPPORT_WIZARD_NAME_KEY, trimmed);
    }
  } catch {
    /* private mode */
  }
}

export function readSupportWizardAgentName(): string {
  try {
    const stored = sessionStorage.getItem(SUPPORT_WIZARD_NAME_KEY)?.trim();
    if (stored && stored.length >= 2) return stored;
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    const snapshot = readWizardFormSnapshot();
    const fromDom = typeof snapshot?.name === "string" ? snapshot.name.trim() : "";
    if (fromDom.length >= 2) return fromDom;
  }
  return "ایجنت جدید";
}

function readNameValue(): string {
  if (typeof document === "undefined") return "";
  const el = document.querySelector('[data-ma-support="wizard-name"]') as HTMLInputElement | null;
  return el?.value?.trim() ?? "";
}

function isSupportAutomationActive(): boolean {
  try {
    return sessionStorage.getItem("ma_support_ui_playing") === "1";
  } catch {
    return false;
  }
}

/** True when automation should try to fix wizard validation (not on every idle poll). */
export function shouldAttemptWizardFieldHeal(force = false): boolean {
  if (typeof window === "undefined") return false;
  if (!window.location.pathname.startsWith("/agents/create")) return false;
  if (!isSupportAutomationActive()) return false;
  if (!force && Date.now() - lastHealAt < HEAL_COOLDOWN_MS) return false;

  if (readAppDialogMessage()) return true;
  if (readWizardNameError()) return true;
  if (readNameValue().length < 2) return true;

  const active = readActiveWizardStepIndex();
  if (active === 1) {
    const prompt = (
      document.querySelector('[data-ma-support="wizard-system-prompt"]') as HTMLTextAreaElement | null
    )?.value?.trim();
    if ((prompt?.length ?? 0) < 8) return true;
  }

  return false;
}

async function pause(ctx: SupportPlayerContext | null, ms: number): Promise<void> {
  if (ctx) await ctx.wait(ms);
  else await sleepAbortable(ms);
}

/** Fill current wizard step via React bridge — visible typing when ctx is present. */
export async function tryHealWizardValidationFromPage(
  ctx?: SupportPlayerContext | null,
  opts?: { force?: boolean }
): Promise<boolean> {
  if (!shouldAttemptWizardFieldHeal(opts?.force)) return false;

  throwIfSupportAborted();
  lastHealAt = Date.now();
  await dismissAppDialogIfOpen();

  if (ctx && hasSupportBridge("wizard.heal_fields")) {
    await runSupportBridge("wizard.heal_fields", {}, ctx);
    return true;
  }

  const healed = await runWizardFieldHeal(ctx ?? null);
  return healed;
}

/** After a failed step advance, heal the current step and click «گام بعد». */
export async function tryHealAndClickWizardNext(
  ctx: SupportPlayerContext | null,
  expectedStep: number
): Promise<boolean> {
  const active = readActiveWizardStepIndex();
  if (active === null || active >= expectedStep) return false;

  await tryHealWizardValidationFromPage(ctx, { force: true });

  const btn = document.querySelector('[data-ma-support="wizard-next"]') as HTMLButtonElement | null;
  if (!btn || btn.disabled) return false;

  if (ctx) await ctx.setStatus("تلاش مجدد — گام بعد…");
  await clickElementVisually(btn, ctx);
  await pause(ctx, 650);
  return true;
}
