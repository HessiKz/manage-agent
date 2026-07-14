import { describe, expect, it } from "vitest";
import {
  asIoFilePolicy,
  canonicalAgentKind,
  filePolicyForKind,
  FILE_POLICY_SPREADSHEET,
  filePolicyForCapabilities,
  KIND_PRESETS,
  DEFAULT_FILE_POLICY,
  DEFAULT_IO_POLICY,
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
      ["run_agent_script"]
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

describe("per-kind I/O presets", () => {
  it("chat: loose input (allow_all_types), docs output", () => {
    const io = filePolicyForKind("chat");
    expect(io.input.allow_all_types).toBe(true);
    expect(io.output.allowed_extensions).toContain(".xlsx");
    expect(io.output.allowed_extensions).toContain(".docx");
  });

  it("worker: bulk-intake input, docs output", () => {
    const io = filePolicyForKind("worker");
    expect(io.input.require_files_to_invoke).toBe(true);
    expect(io.input.min_files).toBe(10);
    expect(io.output.allowed_extensions).toContain(".xlsx");
  });

  it("supervisor + custom: default policies", () => {
    expect(filePolicyForKind("supervisor")).toEqual(DEFAULT_IO_POLICY);
    expect(filePolicyForKind("custom")).toEqual(DEFAULT_IO_POLICY);
  });

  it("asIoFilePolicy: legacy flat coerces to input + default output", () => {
    const flat: AgentFilePolicy = { ...DEFAULT_FILE_POLICY, allowed_extensions: [".pdf"] };
    const io = asIoFilePolicy(flat);
    expect(io.input.allowed_extensions).toEqual([".pdf"]);
    expect(io.output).toEqual(DEFAULT_FILE_POLICY);
  });

  it("asIoFilePolicy: new shape passes through", () => {
    const io = asIoFilePolicy({ input: { ...DEFAULT_FILE_POLICY, allow_all_types: true }, output: DEFAULT_FILE_POLICY });
    expect(io.input.allow_all_types).toBe(true);
    expect(io.output).toEqual(DEFAULT_FILE_POLICY);
  });
});
