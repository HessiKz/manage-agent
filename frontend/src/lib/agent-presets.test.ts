import { describe, expect, it } from "vitest";
import {
  canonicalAgentKind,
  FILE_POLICY_SPREADSHEET,
  filePolicyForCapabilities,
  KIND_PRESETS,
  DEFAULT_FILE_POLICY,
} from "./agent-presets";
import type { AgentFilePolicy } from "@/types";

describe("kind-picker presets", () => {
  it("worker preset disables chat and templates", () => {
    expect(KIND_PRESETS.worker.chat_enabled).toBe(false);
    expect(KIND_PRESETS.worker.actions_enabled).toBe(true);
    expect(KIND_PRESETS.worker.templates_enabled).toBe(false);
  });

  it("supervisor preset enables supervisor mode", () => {
    expect(KIND_PRESETS.supervisor.supervisor_enabled).toBe(true);
  });

  it("maps legacy kinds to canonical four", () => {
    expect(canonicalAgentKind("file_intake")).toBe("worker");
    expect(canonicalAgentKind("api")).toBe("chat");
    expect(canonicalAgentKind("spreadsheet")).toBe("worker");
  });

  it("spreadsheet file policy via capabilities + tool", () => {
    const preset = filePolicyForCapabilities(
      { ...KIND_PRESETS.worker, file_upload_enabled: true },
      ["karkard_process"]
    );
    expect(preset?.allowed_extensions).toContain(".xlsx");
    expect(FILE_POLICY_SPREADSHEET.allowed_extensions).toContain(".xlsx");
  });
});

describe("file policy validation", () => {
  function validate(policy: AgentFilePolicy): string | null {
    if (policy.min_files > policy.max_files) return "min>max";
    if (!policy.allowed_mime_types.length && !policy.allowed_extensions.length) {
      return "empty allowlist";
    }
    return null;
  }

  it("rejects min greater than max", () => {
    expect(validate({ ...DEFAULT_FILE_POLICY, min_files: 100, max_files: 10 })).toBe("min>max");
  });

  it("requires allowlist when upload enabled", () => {
    expect(
      validate({
        ...DEFAULT_FILE_POLICY,
        allowed_mime_types: [],
        allowed_extensions: [],
      })
    ).toBe("empty allowlist");
  });
});
