import { describe, expect, it } from "vitest";
import {
  canNavigateToStep,
  computeSequentialStepComplete,
  computeStepValidity,
  getStepBlockMessage,
  type WizardStepContext,
} from "@/lib/wizard-step-validation";
import { asIoFilePolicy, DEFAULT_FILE_POLICY, KIND_PRESETS } from "@/lib/agent-presets";
import { defaultWidgetPlan } from "@/lib/widget-plan";

function baseCtx(overrides: Partial<WizardStepContext> = {}): WizardStepContext {
  return {
    form: { name: "تست ایجنت", system_prompt: "دستورالعمل کافی برای تست" },
    nameConflict: false,
    nameChecking: false,
    kind: "chat",
    capabilities: KIND_PRESETS.chat,
    filePolicy: asIoFilePolicy(DEFAULT_FILE_POLICY),
    stagedFiles: [],
    actions: [],
    links: [],
    widgetPlan: defaultWidgetPlan(),
    needsApiStep: false,
    apiBindings: { service_ids: [], endpoint_ids: [] },
    permissions: [{ user_id: "u1", can_invoke: true, can_configure: false }],
    permissionsAllowDefault: false,
    ...overrides,
  };
}

describe("wizard-step-validation", () => {
  it("marks steps complete only when prior steps pass", () => {
    const ctx = baseCtx({
      form: { name: "x", system_prompt: "short" },
    });
    const intrinsic = computeStepValidity(ctx);
    const complete = computeSequentialStepComplete(intrinsic, false);
    expect(complete[0]).toBe(false);
    expect(complete[1]).toBe(false);
    expect(complete[2]).toBe(false);
  });

  it("allows navigation to step 2 when step 0 and 1 are complete", () => {
    const intrinsic = computeStepValidity(baseCtx());
    const complete = computeSequentialStepComplete(intrinsic, false);
    expect(complete[0]).toBe(true);
    expect(complete[1]).toBe(true);
    expect(canNavigateToStep(2, complete, 0)).toBe(true);
  });

  it("reports permissions block message when grants are missing", () => {
    const msg = getStepBlockMessage(
      4,
      baseCtx({ permissions: [], permissionsAllowDefault: false })
    );
    expect(msg).not.toBeNull();
  });

  it("blocks permissions step without grants or default ack", () => {
    const msg = getStepBlockMessage(
      4,
      baseCtx({ permissions: [], permissionsAllowDefault: false })
    );
    expect(msg?.message).toMatch(/کاربر/);
  });
});