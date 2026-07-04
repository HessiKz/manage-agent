import { sleepAbortable, SupportUiBlockedError } from "@/lib/support-abort";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import {
  dismissAppDialogIfOpen,
  readAppDialogMessage,
} from "@/lib/support-wizard-errors";
import { tryHealWizardValidationFromPage } from "@/lib/support-wizard-field-heal";
import { detectBlockers } from "@/lib/ui-snapshot";

export type WizardRecoveryOpts = {
  setPermissionsAllowDefault?: (value: boolean) => void;
};

export type WizardFieldHealHandler = (
  ctx: import("@/lib/support-ui-player-context").SupportPlayerContext | null
) => Promise<boolean>;

export const MAX_WIZARD_RECOVERY_ATTEMPTS = 3;

let registeredRecoveryOpts: WizardRecoveryOpts | null = null;
let wizardFieldHealHandler: WizardFieldHealHandler | null = null;

export function registerWizardRecoveryOpts(opts: WizardRecoveryOpts | null): void {
  registeredRecoveryOpts = opts;
}

export function registerWizardFieldHealHandler(handler: WizardFieldHealHandler | null): void {
  wizardFieldHealHandler = handler;
}

export async function runWizardFieldHeal(
  ctx: import("@/lib/support-ui-player-context").SupportPlayerContext | null
): Promise<boolean> {
  if (!wizardFieldHealHandler) return false;
  return wizardFieldHealHandler(ctx);
}

function mergeRecoveryOpts(opts?: WizardRecoveryOpts): WizardRecoveryOpts | undefined {
  if (!registeredRecoveryOpts && !opts) return undefined;
  return { ...registeredRecoveryOpts, ...opts };
}

export function isPermissionsStepReady(): boolean {
  const defaultCb = document.querySelector(
    '[data-ma-support="wizard-permissions-default"]'
  ) as HTMLInputElement | null;
  if (defaultCb?.checked) return true;

  const userBoxes = document.querySelectorAll(
    '[data-ma-support="wizard-permissions-user"], [data-ma-support^="wizard-permissions-user-"]'
  );
  for (const el of userBoxes) {
    if (el instanceof HTMLInputElement && el.checked) return true;
  }
  return false;
}

/**
 * Enable org-default permissions for the wizard step.
 *
 * Prefer the React setter (validation reads React state). Never click the
 * controlled checkbox after setState(true) — that toggles it back off.
 */
export async function ensurePermissionsDefault(
  ctx: SupportPlayerContext | null,
  opts?: WizardRecoveryOpts
): Promise<boolean> {
  const setDefault = opts?.setPermissionsAllowDefault;
  const hasSetter = typeof setDefault === "function";

  const applyDefault = () => {
    if (hasSetter) setDefault!(true);
  };

  applyDefault();
  await dismissAppDialogIfOpen();

  // Brief wait for React to commit checked=true to the DOM (UX only).
  for (let i = 0; i < 8; i++) {
    applyDefault();
    if (isPermissionsStepReady()) return true;
    await pause(ctx, 50);
  }

  // Wizard validation reads permissionsAllowDefault from React state.
  if (hasSetter) {
    applyDefault();
    return true;
  }

  // DOM-only fallback when no React setter is wired.
  const start = Date.now();
  while (Date.now() - start < 4_000) {
    await dismissAppDialogIfOpen();
    if (isPermissionsStepReady()) return true;

    const defaultCb = document.querySelector(
      '[data-ma-support="wizard-permissions-default"]'
    ) as HTMLInputElement | null;

    if (defaultCb && !defaultCb.checked) {
      await clickSelector(ctx, '[data-ma-support="wizard-permissions-default"]');
      await pause(ctx, 220);
      if (isPermissionsStepReady()) return true;
    }

    if (!defaultCb && (await ensureFirstUserSelected(ctx))) return true;
    await pause(ctx, 200);
  }

  if (await ensureFirstUserSelected(ctx)) return true;
  return isPermissionsStepReady();
}

async function ensureFirstUserSelected(ctx: SupportPlayerContext | null): Promise<boolean> {
  const firstUserCb = document.querySelector(
    '[data-ma-support="wizard-permissions-user"], [data-ma-support^="wizard-permissions-user-"]'
  ) as HTMLInputElement | null;
  if (!firstUserCb) return false;
  if (firstUserCb.checked) return true;
  await dismissAppDialogIfOpen();
  await clickSelector(ctx, `[data-ma-support="${firstUserCb.getAttribute("data-ma-support")}"]`);
  await pause(ctx, 280);
  return isPermissionsStepReady();
}

function readBlockerMessage(): string | null {
  return readAppDialogMessage() || detectBlockers()[0]?.text || null;
}

async function pause(
  ctx: SupportPlayerContext | null,
  ms: number
): Promise<void> {
  if (ctx) await ctx.wait(ms);
  else await sleepAbortable(ms);
}

async function clickSelector(
  ctx: SupportPlayerContext | null,
  selector: string
): Promise<void> {
  if (ctx) {
    await ctx.click(selector);
    return;
  }
  const el = document.querySelector(selector);
  if (el instanceof HTMLElement) el.click();
}

export async function tryRecoverWizardBlocker(
  ctx: SupportPlayerContext | null,
  message: string,
  opts?: WizardRecoveryOpts
): Promise<boolean> {
  const text = message.trim();
  if (!text) return false;
  const merged = mergeRecoveryOpts(opts);

  if (
    /نام.*ایجنت|نام.*کاراکتر|حداقل.*۲|name|fill.*name|please.*fill|خالی/i.test(text)
  ) {
    await dismissAppDialogIfOpen();
    if (await tryHealWizardValidationFromPage(ctx)) return true;
  }

  if (/دستورالعمل|system.?prompt|حداقل.*۸/i.test(text)) {
    await dismissAppDialogIfOpen();
    if (await tryHealWizardValidationFromPage(ctx)) return true;
  }

  if (/حداقل یک کاربر|دسترسی پیش‌فرض|permissions/i.test(text)) {
    await dismissAppDialogIfOpen();
    if (await ensurePermissionsDefault(ctx, merged)) return true;
    if (await ensureFirstUserSelected(ctx)) return true;
    return isPermissionsStepReady();
  }

  if (readAppDialogMessage()) {
    await dismissAppDialogIfOpen();
    await pause(ctx, 280);
    if (!readAppDialogMessage() && isPermissionsStepReady()) return true;
    if (!readAppDialogMessage() && !document.querySelector('[data-ma-support="wizard-permissions-default"]')) {
      return true;
    }
  }

  return false;
}

export async function assertWizardClearOrRecover(
  ctx: SupportPlayerContext,
  opts: WizardRecoveryOpts,
  maxAttempts = MAX_WIZARD_RECOVERY_ATTEMPTS
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const blocker = readBlockerMessage();
    if (!blocker) return;

    const recovered = await tryRecoverWizardBlocker(ctx, blocker, opts);
    if (!recovered) {
      throw new SupportUiBlockedError(
        attempt >= maxAttempts - 1
          ? `${blocker}\n\nچند راه‌حل امتحان شد اما مانع برطرف نشد — لطفاً خودتان این مورد را انجام دهید یا راهنمایی دهید.`
          : blocker
      );
    }

    await ctx.setStatus(`رفع خطا و تلاش مجدد (${attempt + 1}/${maxAttempts})…`);
    await ctx.wait(420);
    if (!readBlockerMessage()) return;
  }
}

export function formatRecoveryUserPrompt(blockerText: string): string {
  return `⚠ ${blockerText}\n\nچند راه‌حل خودکار امتحان شد. لطفاً مانع را برطرف کنید یا بگویید چه کاری انجام دهم.`;
}
