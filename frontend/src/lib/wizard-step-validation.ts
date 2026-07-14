import { prepareActionsForPublish, deriveAgentToolNames } from "@/lib/action-inputs";
import {
  agentLinksRequired,
  clampCapabilitiesForKind,
} from "@/lib/capability-rules";
import { validateFilePolicy } from "@/components/agents/file-policy-form";
import {
  scriptSamplesPublishBlock,
  agentLikelyNeedsScript,
  type SampleFileRef,
} from "@/lib/agent-script-samples";
import { validateReviewAlertsPlan } from "@/lib/widget-plan";
import type {
  AgentAction,
  AgentApiBindings,
  AgentCapabilities,
  AgentFile,
  AgentKind,
  AgentLink,
  AgentPermissionGrantInput,
  AgentPromptTemplate,
  IoFilePolicy,
} from "@/types";
import type { AgentWidgetPlan } from "@/lib/widget-plan";

export type WizardStepContext = {
  form: {
    name: string;
    system_prompt: string;
  };
  nameConflict: boolean;
  nameChecking: boolean;
  kind: AgentKind;
  capabilities: AgentCapabilities;
  filePolicy: IoFilePolicy;
  stagedFiles: File[];
  /** Already-uploaded agent files (edit mode) — count toward sample requirements. */
  existingAgentFiles?: Array<AgentFile | SampleFileRef>;
  actions: AgentAction[];
  links: AgentLink[];
  widgetPlan: AgentWidgetPlan;
  needsApiStep: boolean;
  apiBindings: AgentApiBindings;
  permissions: AgentPermissionGrantInput[];
  permissionsAllowDefault: boolean;
};

function sampleFilesForCheck(ctx: WizardStepContext): Array<File | SampleFileRef | AgentFile> {
  return [...(ctx.existingAgentFiles ?? []), ...ctx.stagedFiles];
}

export type StepBlock = { title: string; message: string };

const STEP_LABELS = [
  "اطلاعات پایه",
  "دستورالعمل ایجنت",
  "هشدار و بازبینی",
  "ورودی و خروجی",
  "دسترسی‌ها",
  "تست و انتشار",
] as const;

function step0Valid(ctx: WizardStepContext): boolean {
  return (
    ctx.form.name.trim().length >= 2 && !ctx.nameConflict && !ctx.nameChecking
  );
}

function step1Valid(ctx: WizardStepContext): boolean {
  return ctx.form.system_prompt.trim().length >= 8;
}

function step2Valid(ctx: WizardStepContext): boolean {
  if (!ctx.widgetPlan.review_table.enabled) return true;
  return !validateReviewAlertsPlan(ctx.widgetPlan);
}

function step3Valid(ctx: WizardStepContext): boolean {
  const ioLinksOk = (() => {
    if (!agentLinksRequired(ctx.kind, ctx.capabilities)) return true;
    const linkType = ctx.kind === "supervisor" ? "supervises" : "tool";
    return ctx.links.some((l) => l.link_type === linkType);
  })();
  const scriptSamplesRequired = agentLikelyNeedsScript(
    ctx.kind,
    ctx.capabilities,
    deriveAgentToolNames(ctx.actions),
    ctx.actions
  );
  const sampleFiles = sampleFilesForCheck(ctx);
  const ioFilesOk =
    !ctx.capabilities.file_upload_enabled ||
    (!validateFilePolicy(ctx.filePolicy.input) &&
      (!scriptSamplesRequired || sampleFiles.length > 0));
  const apiCount =
    ctx.apiBindings.service_ids.length + ctx.apiBindings.endpoint_ids.length;
  const ioApiOk = !ctx.needsApiStep || apiCount > 0;
  return ioApiOk && ioFilesOk && ioLinksOk;
}

function step4Valid(ctx: WizardStepContext): boolean {
  return ctx.permissions.length > 0 || ctx.permissionsAllowDefault;
}

/** Per-step intrinsic validity (no sequential gating). */
export function computeStepValidity(ctx: WizardStepContext): boolean[] {
  return [
    step0Valid(ctx),
    step1Valid(ctx),
    step2Valid(ctx),
    step3Valid(ctx),
    step4Valid(ctx),
    false,
  ];
}

/** Sequential: step i is complete only if steps 0..i all pass intrinsic checks. */
export function computeSequentialStepComplete(
  intrinsic: boolean[],
  step6Complete = false
): boolean[] {
  const out: boolean[] = [];
  let priorOk = true;
  for (let i = 0; i < intrinsic.length; i++) {
    const ok = i === 5 ? step6Complete : intrinsic[i] && priorOk;
    out.push(ok);
    if (!intrinsic[i]) priorOk = false;
  }
  return out;
}

export function canNavigateToStep(
  targetIndex: number,
  stepComplete: boolean[],
  currentIndex: number,
  opts?: { lastStepRequiresAgent?: boolean; hasActiveAgent?: boolean }
): boolean {
  if (targetIndex === currentIndex) return true;
  if (
    opts?.lastStepRequiresAgent &&
    targetIndex === stepComplete.length - 1 &&
    !opts.hasActiveAgent
  ) {
    return false;
  }
  for (let i = 0; i < targetIndex; i++) {
    if (!stepComplete[i]) return false;
  }
  return true;
}

export function getStepBlockMessage(
  stepIndex: number,
  ctx: WizardStepContext
): StepBlock | null {
  const label = STEP_LABELS[stepIndex] ?? "مرحله";
  switch (stepIndex) {
    case 0:
      if (ctx.nameChecking) {
        return { title: label, message: "لطفاً تا پایان بررسی نام صبر کنید." };
      }
      if (ctx.nameConflict) {
        return { title: label, message: "این نام قبلاً استفاده شده — نام دیگری انتخاب کنید." };
      }
      if (ctx.form.name.trim().length < 2) {
        return { title: label, message: "نام ایجنت باید حداقل ۲ کاراکتر باشد." };
      }
      return null;
    case 1:
      if (ctx.form.system_prompt.trim().length < 8) {
        return {
          title: label,
          message: "دستورالعمل اصلی باید حداقل ۸ کاراکتر باشد.",
        };
      }
      return null;
    case 2: {
      const err = validateReviewAlertsPlan(ctx.widgetPlan);
      if (err) return { title: label, message: err };
      return null;
    }
    case 3: {
      const clamped = clampCapabilitiesForKind(ctx.kind, ctx.capabilities);
      const sampleBlock = scriptSamplesPublishBlock(
        ctx.kind,
        clamped,
        deriveAgentToolNames(prepareActionsForPublish(ctx.actions)),
        prepareActionsForPublish(ctx.actions),
        sampleFilesForCheck(ctx)
      );
      if (sampleBlock) {
        return { title: sampleBlock.title, message: sampleBlock.message };
      }
      if (ctx.needsApiStep) {
        const apiCount =
          ctx.apiBindings.service_ids.length + ctx.apiBindings.endpoint_ids.length;
        if (!apiCount) {
          return {
            title: label,
            message: "حداقل یک سرویس یا endpoint API انتخاب کنید.",
          };
        }
      }
      if (ctx.capabilities.file_upload_enabled) {
        const policyErr = validateFilePolicy(ctx.filePolicy.input);
        if (policyErr) return { title: label, message: policyErr };
      }
      if (agentLinksRequired(ctx.kind, ctx.capabilities)) {
        const linkType = ctx.kind === "supervisor" ? "supervises" : "tool";
        if (!ctx.links.some((l) => l.link_type === linkType)) {
          return {
            title: label,
            message:
              ctx.kind === "supervisor"
                ? "برای ایجنت سرپرست حداقل یک زیرایجنت انتخاب کنید."
                : "با فعال بودن «فراخوانی ایجنت‌ها» حداقل یک ایجنت مقصد انتخاب کنید.",
          };
        }
      }
      return null;
    }
    case 4:
      if (!ctx.permissions.length && !ctx.permissionsAllowDefault) {
        return {
          title: label,
          message:
            "حداقل یک کاربر را انتخاب کنید، یا گزینه «دسترسی پیش‌فرض سازمان» را تأیید کنید.",
        };
      }
      return null;
    default:
      return null;
  }
}
