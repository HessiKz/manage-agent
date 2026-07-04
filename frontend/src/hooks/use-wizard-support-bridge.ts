"use client";

import { useEffect, useRef } from "react";
import { KIND_PRESETS, canonicalAgentKind } from "@/lib/agent-presets";
import { registerSupportBridge, runSupportBridge } from "@/lib/support-automation-bridge";
import { captureUiSnapshot } from "@/lib/ui-snapshot";
import {
  readCreatedAgentSlug,
  shouldBlockWizardCreateWalk,
  storeWizardCreatePayload,
} from "@/lib/support-wizard-mission";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import { setSupportWizardAgentName, readSupportWizardAgentName } from "@/lib/support-wizard-field-heal";
import {
  assertWizardClearOrRecover,
  ensurePermissionsDefault,
  MAX_WIZARD_RECOVERY_ATTEMPTS,
  registerWizardFieldHealHandler,
  registerWizardRecoveryOpts,
  type WizardRecoveryOpts,
} from "@/lib/support-wizard-recovery";
import {
  dismissAppDialogIfOpen,
  confirmWizardNameViaApi,
  isPublishRetryableError,
  readActiveWizardStepIndex,
  resolveNextUniqueAgentName,
  resolveUniqueAgentName,
  throwIfWizardBlocked,
  waitForWizardPublishResult,
  waitForWizardStepAdvance,
} from "@/lib/support-wizard-errors";
import type { AgentKind } from "@/types";

type FormState = {
  name: string;
  description: string;
  department: string;
  system_prompt: string;
  tool_names: string[];
  model_name: string;
  temperature: number;
};

type Opts = {
  visibleSteps: string[];
  setStep: (n: number) => void;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  applyKind: (next: AgentKind, caps: (typeof KIND_PRESETS)[AgentKind]) => void;
  setPermissionsAllowDefault: (value: boolean) => void;
};

type StepFillState = {
  activeName: string;
  description: string;
  department: string;
  kind: AgentKind;
  outputSpec: string;
};

const MAX_PUBLISH_RETRIES = 4;
const PASSIVE_STEP_PAUSE_MS = 550;

function recoveryOpts(o: Opts): WizardRecoveryOpts {
  return { setPermissionsAllowDefault: o.setPermissionsAllowDefault };
}

async function clearOrRecover(
  ctx: SupportPlayerContext,
  o: Opts
): Promise<void> {
  await assertWizardClearOrRecover(ctx, recoveryOpts(o), MAX_WIZARD_RECOVERY_ATTEMPTS);
}

async function fillWizardName(
  o: Opts,
  ctx: SupportPlayerContext,
  name: string
): Promise<void> {
  await ctx.setStatus("وارد کردن نام ایجنت");
  await ctx.highlight('[data-ma-support="wizard-name"]');
  await ctx.typeIntoElement('[data-ma-support="wizard-name"]', name);
  o.setForm((f) => ({ ...f, name }));
  await ctx.wait(550);
}

async function ensureAvailableName(
  ctx: SupportPlayerContext,
  name: string
): Promise<string> {
  let active = name.trim();
  const check = await confirmWizardNameViaApi(active);
  if (check.available) return active;

  const next = await resolveNextUniqueAgentName(active);
  await ctx.setStatus(`نام اشغال است — از «${next.name}» استفاده می‌کنم`);
  active = next.name;
  const recheck = await confirmWizardNameViaApi(active);
  if (!recheck.available) {
    throw new Error(`شناسه «${recheck.slug}» در دسترس نیست — نام دیگری لازم است.`);
  }
  return active;
}

async function visitWizardStep(
  o: Opts,
  ctx: SupportPlayerContext,
  stepIdx: number,
  label: string,
  total: number
): Promise<void> {
  const active = readActiveWizardStepIndex();
  if (active !== null && stepIdx > active) {
    await clearOrRecover(ctx, o);
    throw new Error(
      `مرحله «${label}» باز نشد — احتمالاً اعتبارسنجی مرحله قبل ناموفق بود.`
    );
  }

  if (active !== stepIdx) {
    o.setStep(stepIdx);
    await ctx.wait(480);
    await clearOrRecover(ctx, o);
  }

  await ctx.setStatus(`مرحله ${stepIdx + 1} از ${total}: ${label}`);
  await ctx.highlight(`[data-ma-support="wizard-step-tab-${stepIdx}"]`);
  await ctx.highlight('[data-ma-support="wizard-step-body"]');
  await ctx.wait(320);
}

async function clickWizardNext(o: Opts, ctx: SupportPlayerContext, stepLabel: string): Promise<void> {
  if (stepLabel === "دسترسی‌ها") {
    const ok = await ensurePermissionsDefault(ctx, recoveryOpts(o));
    if (!ok) {
      throw new Error("قبل از شروع تست باید دسترسی پیش‌فرض یا یک کاربر انتخاب شود.");
    }
    await ctx.wait(300);
  }

  for (let attempt = 0; attempt < MAX_WIZARD_RECOVERY_ATTEMPTS; attempt++) {
    await clearOrRecover(ctx, o);
    await ctx.highlight('[data-ma-support="wizard-next"]');
    await ctx.click('[data-ma-support="wizard-next"]');
    await ctx.wait(650);
    try {
      await clearOrRecover(ctx, o);
      return;
    } catch {
      if (attempt >= MAX_WIZARD_RECOVERY_ATTEMPTS - 1) {
        await clearOrRecover(ctx, o);
      }
    }
  }
}

async function fillStepContent(
  o: Opts,
  ctx: SupportPlayerContext,
  label: string,
  fill: StepFillState
): Promise<void> {
  switch (label) {
    case "اطلاعات پایه": {
      fill.activeName = await ensureAvailableName(ctx, fill.activeName);
      await fillWizardName(o, ctx, fill.activeName);
      setSupportWizardAgentName(fill.activeName);
      o.setForm((f) => ({ ...f, name: fill.activeName }));

      const desc =
        fill.description.trim() ||
        `دستیار «${fill.activeName}» برای پاسخ‌گویی ساختارمند در محدوده وظایف تعریف‌شده.`;
      await ctx.setStatus("وارد کردن توضیح");
      await ctx.highlight('[data-ma-support="wizard-description"]');
      await ctx.typeIntoElement('[data-ma-support="wizard-description"]', desc);
      o.setForm((f) => ({ ...f, description: desc }));
      await ctx.wait(350);

      await ctx.setStatus("انتخاب دپارتمان");
      await ctx.highlight('[data-ma-support="wizard-department"]');
      o.setForm((f) => ({ ...f, department: fill.department }));
      await ctx.wait(300);
      break;
    }
    case "ورودی و خروجی": {
      await ctx.setStatus(`انتخاب نوع ایجنت: ${fill.kind}`);
      await ctx.highlight(`[data-ma-support="wizard-kind-${fill.kind}"]`);
      o.applyKind(fill.kind, KIND_PRESETS[fill.kind]);
      await ctx.wait(500);
      break;
    }
    case "دستورالعمل ایجنت": {
      const prompt =
        fill.outputSpec.trim() ||
        fill.description.trim() ||
        `شما دستیار «${fill.activeName}» هستید. پاسخ‌های کوتاه، ساختارمند و مفید بدهید.`;
      await ctx.setStatus("تنظیم دستورالعمل ایجنت");
      o.setForm((f) => ({ ...f, system_prompt: prompt }));
      await ctx.highlight('[data-ma-support="wizard-system-prompt"]');
      await ctx.wait(450);
      break;
    }
    case "دسترسی‌ها": {
      await ctx.setStatus("تأیید دسترسی پیش‌فرض سازمان");
      const ok = await ensurePermissionsDefault(ctx, recoveryOpts(o));
      if (!ok) {
        throw new Error("فعال‌سازی دسترسی پیش‌فرض سازمان ناموفق بود.");
      }
      await ctx.wait(350);
      break;
    }
    default:
      await ctx.wait(PASSIVE_STEP_PAUSE_MS);
      break;
  }
}

async function walkWizardSteps(
  o: Opts,
  ctx: SupportPlayerContext,
  fill: StepFillState
): Promise<void> {
  // Never reset to step 0 if an agent was already persisted.
  if (shouldBlockWizardCreateWalk()) return;

  const total = o.visibleSteps.length;
  o.setStep(0);
  await ctx.wait(500);
  await clearOrRecover(ctx, o);

  for (let i = 0; i < total; i++) {
    if (shouldBlockWizardCreateWalk() || readCreatedAgentSlug()) return;

    const label = o.visibleSteps[i];
    await visitWizardStep(o, ctx, i, label, total);
    await fillStepContent(o, ctx, label, fill);

    if (label === "تست و انتشار") {
      return;
    }

    await clickWizardNext(o, ctx, label);
    await waitForWizardStepAdvance(ctx, i + 1);
  }
}

async function healWizardFields(
  o: Opts,
  ctx: SupportPlayerContext
): Promise<boolean> {
  await dismissAppDialogIfOpen();
  const active = readActiveWizardStepIndex() ?? 0;
  const label = o.visibleSteps[active] ?? o.visibleSteps[0];
  const baseName = readSupportWizardAgentName();

  const fill: StepFillState = {
    activeName: baseName,
    description: `دستیار «${baseName}» برای پاسخ‌گویی ساختارمند در محدوده وظایف تعریف‌شده.`,
    department: "ops",
    kind: canonicalAgentKind("chat"),
    outputSpec: "",
  };

  fill.activeName = await ensureAvailableName(ctx, fill.activeName);
  setSupportWizardAgentName(fill.activeName);

  if (readActiveWizardStepIndex() !== active) {
    o.setStep(active);
    await ctx.wait(400);
  }

  await ctx.setStatus(`رفع خطا — تکمیل «${label}»…`);
  await fillStepContent(o, ctx, label, fill);
  return true;
}

export function useWizardSupportBridge(opts: Opts) {
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    registerWizardRecoveryOpts({
      setPermissionsAllowDefault: (value) => ref.current.setPermissionsAllowDefault(value),
    });
    registerWizardFieldHealHandler(async (ctx) => {
      if (!ctx) return false;
      return healWizardFields(ref.current, ctx);
    });
    return () => {
      registerWizardRecoveryOpts(null);
      registerWizardFieldHealHandler(null);
    };
  }, []);

  useEffect(() => {
    return registerSupportBridge("wizard.heal_fields", async (_payload, ctx) => {
      await healWizardFields(ref.current, ctx);
    });
  }, []);

  useEffect(() => {
    return registerSupportBridge("wizard.create", async (payload, ctx) => {
      // Do NOT clear session slug here — that caused a second agent from step 1.
      const bridgePayload = { ...(payload ?? {}) };
      if (bridgePayload.name) {
        storeWizardCreatePayload(bridgePayload);
      }

      // Hard stop: agent already saved or testing UI up — only continue_testing.
      if (shouldBlockWizardCreateWalk()) {
        await ctx.setStatus(
          "ایجنت از قبل ذخیره شده — ادامه تست بدون بازگشت به مرحله ۱…"
        );
        let slug = readCreatedAgentSlug();
        if (!slug) {
          await waitForWizardPublishResult(ctx);
          slug = readCreatedAgentSlug();
        }
        if (!slug) {
          throw new Error(
            "ایجنت در حال آماده‌سازی است اما شناسه پیدا نشد — لطفاً صفحه را رفرش نکنید و دوباره «ادامه تست» بگویید."
          );
        }
        await runSupportBridge(
          "wizard.continue_testing",
          { ...bridgePayload, agent_slug: slug },
          ctx
        );
        return;
      }

      const requestedName = String(bridgePayload?.name ?? "").trim();
      if (!requestedName) throw new Error("نام ایجنت مشخص نیست");

      const description = String(payload?.description ?? "");
      const department = String(payload?.department ?? "ops");
      const kind = canonicalAgentKind(String(payload?.kind ?? "chat"));
      const outputSpec = String(payload?.output_format_spec ?? "");

      let nameCursor = requestedName;

      for (let publishAttempt = 0; publishAttempt < MAX_PUBLISH_RETRIES; publishAttempt++) {
        const o = ref.current;

        await ctx.setStatus("بررسی در دسترس بودن نام ایجنت…");
        const unique = await resolveUniqueAgentName(nameCursor);
        let activeName = unique.name;
        setSupportWizardAgentName(activeName);

        if (unique.renamed) {
          await ctx.setStatus(
            `نام «${nameCursor}» قبلاً ثبت شده — از «${activeName}» (شناسه: ${unique.slug}) استفاده می‌کنم`
          );
          await ctx.wait(400);
        }

        const fill: StepFillState = {
          activeName,
          description,
          department,
          kind,
          outputSpec,
        };

        await ctx.setStatus("پیمایش مرحله‌به‌مرحله ویزارد ساخت…");
        await walkWizardSteps(o, ctx, fill);
        activeName = fill.activeName;
        await clearOrRecover(ctx, o);

        const finalCheck = await confirmWizardNameViaApi(activeName);
        if (!finalCheck.available) {
          nameCursor = (await resolveNextUniqueAgentName(activeName)).name;
          continue;
        }

        await ctx.setStatus("منتظر آماده‌سازی تست…");

        try {
          await waitForWizardPublishResult(ctx);
          const createdSlug = readCreatedAgentSlug();
          if (createdSlug) {
            bridgePayload.agent_slug = createdSlug;
          }
          return;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          throwIfWizardBlocked();
          const snap = captureUiSnapshot();
          if (snap.blocked) {
            throw new Error(snap.blockerText || message);
          }
          if (!isPublishRetryableError(message) || publishAttempt >= MAX_PUBLISH_RETRIES - 1) {
            throw e;
          }
          const next = await resolveNextUniqueAgentName(activeName);
          nameCursor = next.name;
          await ctx.setStatus(
            `خطا در آماده‌سازی تست — نام بعدی «${next.name}» (شناسه: ${next.slug})`
          );
          await ctx.wait(500);
        }
      }

      throw new Error("آماده‌سازی تست ایجنت پس از چند تلاش ناموفق بود.");
    });
  }, []);
}
