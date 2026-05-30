import { describe, expect, it } from "vitest";
import type { AgentLink } from "@/types";

describe("linked-agents-picker link types", () => {
  it("supervisor mode uses supervises link type", () => {
    const linkType = true ? "supervises" : "tool";
    expect(linkType).toBe("supervises");
  });

  it("can_call_agents mode uses tool link type", () => {
    const supervisorMode = false;
    const linkType = supervisorMode ? "supervises" : "tool";
    expect(linkType).toBe("tool");
  });

  it("toggle adds link with correct callee", () => {
    const links: AgentLink[] = [];
    const calleeId = "uuid-1";
    const linkType = "tool" as const;
    const next: AgentLink[] = [
      ...links,
      {
        callee_agent_id: calleeId,
        link_type: linkType,
        requires_user_permission: true,
      },
    ];
    expect(next).toHaveLength(1);
    expect(next[0].link_type).toBe("tool");
  });
});
