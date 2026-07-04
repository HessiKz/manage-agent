import { describe, expect, it } from "vitest";
import {
  clampCapabilitiesForKind,
  shouldShowAgentLinks,
} from "./capability-rules";
import { KIND_PRESETS } from "./agent-presets";

describe("clampCapabilitiesForKind", () => {
  it("worker cannot enable supervisor or chat", () => {
    const caps = clampCapabilitiesForKind("worker", {
      ...KIND_PRESETS.worker,
      chat_enabled: true,
      supervisor_enabled: true,
      can_call_agents: true,
      templates_enabled: true,
    });
    expect(caps.chat_enabled).toBe(false);
    expect(caps.supervisor_enabled).toBe(false);
    expect(caps.can_call_agents).toBe(false);
    expect(caps.templates_enabled).toBe(false);
  });

  it("custom cannot enable supervisor", () => {
    const caps = clampCapabilitiesForKind("custom", {
      ...KIND_PRESETS.custom,
      supervisor_enabled: true,
    });
    expect(caps.supervisor_enabled).toBe(false);
  });

  it("supervisor keeps routing enabled and disables worker caps", () => {
    const caps = clampCapabilitiesForKind("supervisor", {
      ...KIND_PRESETS.supervisor,
      actions_enabled: true,
      can_call_agents: true,
      chat_enabled: false,
    });
    expect(caps.supervisor_enabled).toBe(true);
    expect(caps.chat_enabled).toBe(true);
    expect(caps.actions_enabled).toBe(false);
    expect(caps.can_call_agents).toBe(false);
  });
});

describe("shouldShowAgentLinks", () => {
  it("shows for supervisor kind", () => {
    expect(shouldShowAgentLinks("supervisor", KIND_PRESETS.supervisor)).toBe(true);
  });

  it("shows when custom enables can_call_agents", () => {
    expect(
      shouldShowAgentLinks("custom", { ...KIND_PRESETS.custom, can_call_agents: true })
    ).toBe(true);
  });

  it("hides for plain chat", () => {
    expect(shouldShowAgentLinks("chat", KIND_PRESETS.chat)).toBe(false);
  });
});
