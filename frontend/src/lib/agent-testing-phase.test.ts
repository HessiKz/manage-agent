import { describe, expect, it } from "vitest";
import {
  isAwaitingInteractiveTraining,
  needsTrainingBootstrap,
  resolveTestingPhase,
  validationStepIndex,
} from "@/lib/agent-testing-phase";

describe("agent-testing-phase", () => {
  it("treats runtime_prepare as interactive training, not auto-test step 2", () => {
    const v = {
      state: "runtime_prepare",
      current_phase: "runtime_prepare",
      training_completed: false,
    };
    expect(isAwaitingInteractiveTraining("deploying", v)).toBe(true);
    expect(resolveTestingPhase("deploying", v)).toBe("training");
    expect(needsTrainingBootstrap(v)).toBe(true);
  });

  it("shows auto-test step 2 only after training completes", () => {
    const v = {
      state: "running",
      current_phase: "instruction_compile",
      training_completed: true,
    };
    expect(isAwaitingInteractiveTraining("deploying", v)).toBe(false);
    expect(resolveTestingPhase("deploying", v)).toBe("testing");
    expect(validationStepIndex(v)).toBe(2);
  });

  it("keeps training phase when state is training", () => {
    const v = {
      state: "training",
      current_phase: "training",
      training_completed: false,
    };
    expect(resolveTestingPhase("deploying", v)).toBe("training");
    expect(needsTrainingBootstrap(v)).toBe(false);
  });

  it("shows planning questions in the interactive training step (before free chat)", () => {
    const v = {
      state: "planning",
      current_phase: "planning",
      planning: {
        awaiting_answers: true,
        questions: [{ id: "q1", text: "سؤال" }],
      },
    };
    expect(resolveTestingPhase("deploying", v)).toBe("training");
    expect(isAwaitingInteractiveTraining("deploying", v)).toBe(true);
  });

  it("reports success only after validation done when status is active", () => {
    const v = {
      state: "done",
      current_phase: "done",
      planning: { awaiting_answers: false },
    };
    expect(resolveTestingPhase("active", v)).toBe("success");
  });
});
