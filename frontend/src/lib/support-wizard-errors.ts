import { checkAgentNameAvailable } from "@/lib/api";
import { sleepAbortable, SupportUiBlockedError, throwIfSupportAborted } from "@/lib/support-abort";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import { formatWaitClock, waitUntilOrAskExtend } from "@/lib/support-wait-extend";
import { tryHealAndClickWizardNext, tryHealWizardValidationFromPage } from "@/lib/support-wizard-field-heal";
import { assertNoUiBlocker } from "@/lib/ui-snapshot";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function parseTrailingNumber(text: string): { stem: string; next: number } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.*?)(?:\s+([۰-۹0-9]+))?\s*$/u);
  const stem = (match?.[1] ?? trimmed).trim() || trimmed;
  if (!match?.[2]) return { stem, next: 2 };
  const digits = match[2].replace(/[۰-۹]/g, (c) => {
    const idx = PERSIAN_DIGITS.indexOf(c);
    return idx >= 0 ? String(idx) : c;
  });
  const n = parseInt(digits, 10);
  return { stem, next: Number.isFinite(n) ? n + 1 : 2 };
}

function* nameCandidates(baseName: string): Generator<string> {
  const trimmed = baseName.trim();
  if (!trimmed) return;
  yield trimmed;
  const { stem, next } = parseTrailingNumber(trimmed);
  for (let i = 0; i < 40; i++) {
    yield `${stem} ${next + i}`;
  }
  yield `${stem} ${Date.now() % 100_000}`;
}

export async function resolveUniqueAgentName(baseName: string): Promise<{
  name: string;
  renamed: boolean;
  slug: string;
}> {
  for (const candidate of nameCandidates(baseName)) {
    throwIfSupportAborted();
    const res = await checkAgentNameAvailable(candidate);
    if (res.available) {
      return {
        name: candidate,
        renamed: candidate.trim() !== baseName.trim(),
        slug: res.slug,
      };
    }
  }
  throw new Error(`نامی آزاد برای «${baseName.trim()}» پیدا نشد — لطفاً نام دیگری پیشنهاد دهید.`);
}

export async function resolveNextUniqueAgentName(takenName: string): Promise<{
  name: string;
  slug: string;
}> {
  const { stem, next } = parseTrailingNumber(takenName);
  const res = await resolveUniqueAgentName(`${stem} ${next}`);
  return { name: res.name, slug: res.slug };
}

/** Confirm slug availability via API (not DOM — wizard steps hide the name field). */
export async function confirmWizardNameViaApi(
  name: string,
  timeoutMs = 45_000
): Promise<{ name: string; slug: string; available: boolean }> {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    throw new Error("نام ایجنت باید حداقل ۲ حرف باشد");
  }

  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    try {
      const res = await checkAgentNameAvailable(trimmed);
      return { name: trimmed, slug: res.slug, available: res.available };
    } catch (e) {
      lastError = e;
      await sleepAbortable(400);
    }
  }
  const hint = lastError instanceof Error ? lastError.message : "";
  throw new Error(
    hint
      ? `بررسی نام ایجنت ناموفق بود: ${hint}`
      : "بررسی نام ایجنت ناموفق بود — اتصال را بررسی کنید."
  );
}

export async function waitForWizardStepAdvance(
  ctx: SupportPlayerContext,
  expectedIdx: number
): Promise<void> {
  await waitUntilOrAskExtend(
    async () => {
      await tryHealWizardValidationFromPage(ctx);
      if (await tryHealAndClickWizardNext(ctx, expectedIdx)) {
        await sleepAbortable(300);
      }
      throwIfWizardBlocked();
      if (document.querySelector('[data-ma-support="wizard-bootstrap-loading"]')) {
        await waitForWizardBootstrap(ctx);
      }
      const active = readActiveWizardStepIndex();
      return active === expectedIdx || (active !== null && active > expectedIdx);
    },
    {
      chunkMs: 180_000,
      pollMs: 280,
      promptTitle: "پیشرفت ویزارد",
      promptMessage: `رفتن به مرحله ${expectedIdx + 1} بیش از حد معمول طول کشید. بیشتر صبر کنیم؟`,
      formatStatus: (sec) => `منتظر مرحله ${expectedIdx + 1}… (${formatWaitClock(sec)})`,
    },
    ctx
  );
}

async function waitForWizardBootstrap(ctx: SupportPlayerContext): Promise<void> {
  await waitUntilOrAskExtend(
    () => {
      throwIfWizardBlocked();
      return !document.querySelector('[data-ma-support="wizard-bootstrap-loading"]');
    },
    {
      chunkMs: 300_000,
      pollMs: 500,
      promptTitle: "آماده‌سازی تست",
      promptMessage:
        "آماده‌سازی تست (ساخت ایجنت، محیط اجرا، آموزش) بیش از حد معمول طول کشید. بیشتر صبر کنیم؟",
      formatStatus: (sec) => `آماده‌سازی تست… (${formatWaitClock(sec)})`,
    },
    ctx
  );
}

export function readWizardNameError(): string | null {
  const el = document.querySelector('[data-ma-support="wizard-name-error"]');
  return el?.textContent?.trim() || null;
}

export function readAppDialogMessage(): string | null {
  const dialog = document.querySelector('[data-ma-support="app-dialog"]');
  if (!dialog) return null;
  const msgEl = dialog.querySelector('[data-ma-support="app-dialog-message"]');
  return msgEl?.textContent?.trim() || null;
}

export function throwIfWizardBlocked(): void {
  const dialogMsg = readAppDialogMessage();
  if (dialogMsg) {
    throw new SupportUiBlockedError(dialogMsg);
  }
  assertNoUiBlocker();
}

export async function dismissAppDialogIfOpen(): Promise<string | null> {
  const message = readAppDialogMessage();
  if (!message) return null;
  const btn = document.querySelector(
    '[data-ma-support="app-dialog-confirm"]'
  ) as HTMLButtonElement | null;
  btn?.click();
  await sleepAbortable(200);
  return message;
}

export function readActiveWizardStepIndex(): number | null {
  const active = document.querySelector('[data-ma-support][aria-current="step"]');
  if (!active) return null;
  const match = active.getAttribute("data-ma-support")?.match(/wizard-step-tab-(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function isPublishRetryableError(message: string): boolean {
  const m = message.toLowerCase();
  if (
    m.includes("دسترسی پیش‌فرض") ||
    m.includes("قبل از شروع تست باید") ||
    m.includes("فعال‌سازی دسترسی پیش‌فرض") ||
    (m.includes("حداقل") && m.includes("کاربر"))
  ) {
    return true;
  }
  if (
    (m.includes("مجاز نیست") && (m.includes("ادمین") || m.includes("مدیر سیستم"))) ||
    m.includes("403") ||
    m.includes("forbidden") ||
    m.includes("superuser") ||
    (m.includes("ساخت ایجنت") && m.includes("ادمین"))
  ) {
    return false;
  }
  return (
    m.includes("تکراری") ||
    m.includes("وجود دارد") ||
    m.includes("duplicate") ||
    m.includes("already exists") ||
    m.includes("409")
  );
}

export async function waitForWizardPublishResult(
  ctx: SupportPlayerContext
): Promise<void> {
  await waitUntilOrAskExtend(
    async () => {
      throwIfSupportAborted();
      if (
        window.location.pathname.startsWith("/agents/create") &&
        window.location.search.includes("slug=")
      ) {
        return true;
      }

      const dialogMsg = await dismissAppDialogIfOpen();
      if (dialogMsg) {
        await tryHealWizardValidationFromPage(ctx);
        const nameLen = (
          document.querySelector('[data-ma-support="wizard-name"]') as HTMLInputElement | null
        )?.value?.trim().length ?? 0;
        if (nameLen >= 2) {
          return false;
        }
        throw new Error(dialogMsg);
      }

      const domNameErr = readWizardNameError();
      if (domNameErr) {
        if (await tryHealWizardValidationFromPage(ctx)) return false;
        throw new Error(domNameErr);
      }

      return false;
    },
    {
      chunkMs: 240_000,
      pollMs: 400,
      promptTitle: "آماده‌سازی تست",
      promptMessage: "آماده‌سازی تست (ساخت ایجنت، محیط اجرا، آموزش) بیش از حد معمول طول کشید. بیشتر صبر کنیم؟",
      formatStatus: (sec) => `منتظر آماده‌سازی تست… (${formatWaitClock(sec)})`,
    },
    ctx
  );
}
