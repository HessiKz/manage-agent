import { describe, expect, it, vi, afterEach } from "vitest";
import {
  isAgentValidationComplete,
  isPlanningAwaitingAnswers,
  isWizardPlanningQuestionsVisible,
  isWizardTestingDomComplete,
} from "@/lib/support-testing-actions";
import { supportCompletionLine } from "@/lib/support-assistant-text";
import type { SupportUiScript } from "@/lib/support-ui-script";
import type { Agent } from "@/types";

function agentWithValidation(
  status: Agent["status"],
  validation: Record<string, unknown>
): Agent {
  return {
    id: "a1",
    slug: "test-agent",
    name: "Test",
    status,
    config_json: { validation },
  } as Agent;
}

const wizardScript: SupportUiScript = {
  label: "ساخت ایجنت",
  steps: [{ type: "bridge", action: "wizard.create", payload: {}, label: "ویزارد" }],
};

describe("support-testing-actions", () => {
  it("detects planning awaiting answers", () => {
    expect(
      isPlanningAwaitingAnswers({
        planning: {
          awaiting_answers: true,
          questions: [{ id: "q1", text: "سؤال؟" }],
        },
      })
    ).toBe(true);
  });

  it("does not treat active status as validation complete while planning is open", () => {
    const agent = agentWithValidation("active", {
      state: "running",
      current_phase: "planning",
      planning: {
        awaiting_answers: true,
        questions: [{ id: "q1", text: "معیار درستی؟" }],
      },
    });
    expect(isAgentValidationComplete(agent)).toBe(false);
  });

  it("treats validation as complete only when state is done and planning settled", () => {
    const agent = agentWithValidation("active", {
      state: "done",
      current_phase: "done",
      planning: {
        awaiting_answers: false,
        answers: { q1: "بله" },
      },
    });
    expect(isAgentValidationComplete(agent)).toBe(true);
  });

  describe("DOM markers", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("reads wizard planning and completion markers from the DOM", () => {
      const querySelector = vi
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({})
        .mockReturnValueOnce({})
        .mockReturnValueOnce(null);
      vi.stubGlobal("document", { querySelector });

      expect(isWizardPlanningQuestionsVisible()).toBe(false);
      expect(isWizardPlanningQuestionsVisible()).toBe(true);
      expect(isWizardTestingDomComplete()).toBe(true);
      expect(isWizardTestingDomComplete()).toBe(false);
    });
  });
});

describe("supportCompletionLine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not claim full success while planning questions are visible", () => {
    vi.stubGlobal("document", {
      querySelector: (sel: string) =>
        sel === '[data-ma-support="wizard-planning-questions"]' ? {} : null,
    });
    const line = supportCompletionLine(wizardScript);
    expect(line).not.toContain("تمام شد — ساخت، آموزش و پنل");
    expect(line).toContain("هنوز تمام نشده");
  });

  it("claims full success only when wizard-testing-complete is present", () => {
    vi.stubGlobal("document", {
      querySelector: (sel: string) =>
        sel === '[data-ma-support="wizard-testing-complete"]' ? {} : null,
    });
    const line = supportCompletionLine(wizardScript);
    expect(line).toContain("تمام شد — ساخت، آموزش و پنل");
  });

  it("reports in-progress testing when wizard ran but completion marker is absent", () => {
    vi.stubGlobal("document", { querySelector: () => null });
    const line = supportCompletionLine(wizardScript);
    expect(line).toContain("تست خودکار هنوز در جریان است");
  });
});
