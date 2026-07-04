import { describe, expect, it } from "vitest";
import { buildTrainingProgressSteps } from "./agent-training-scenarios";

describe("buildTrainingProgressSteps", () => {
  it("starts on ask step with no user activity", () => {
    const steps = buildTrainingProgressSteps({
      hasUserTurn: false,
      hasAssistantReply: false,
      canFinish: false,
    });
    expect(steps[0].status).toBe("current");
    expect(steps[1].status).toBe("pending");
    expect(steps[2].status).toBe("pending");
  });

  it("does not mark confirm done before assistant reply", () => {
    const steps = buildTrainingProgressSteps({
      hasUserTurn: true,
      hasAssistantReply: false,
      canFinish: true,
    });
    expect(steps[0].status).toBe("done");
    expect(steps[1].status).toBe("current");
    expect(steps[2].status).toBe("current");
  });
});
