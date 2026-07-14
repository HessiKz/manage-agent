import { describe, expect, it } from "vitest";
import {
  agentLikelyNeedsScript,
  missingScriptSampleGaps,
  scriptSamplesPublishBlock,
} from "@/lib/agent-script-samples";
import { asInstructionFile, asOutputSampleFile } from "@/lib/agent-file-roles";

const workerCaps = {
  chat_enabled: false,
  file_upload_enabled: true,
  actions_enabled: true,
  templates_enabled: false,
  can_call_agents: false,
  supervisor_enabled: false,
  external_apis_enabled: false,
};

function file(name: string): File {
  return new File(["x"], name, { type: "text/plain" });
}

describe("agent-script-samples", () => {
  it("worker without builtin tool needs script samples", () => {
    expect(agentLikelyNeedsScript("worker", workerCaps, [], [])).toBe(true);
    expect(agentLikelyNeedsScript("worker", workerCaps, ["run_agent_script"], [])).toBe(true);
  });

  it("detects missing input and output", () => {
    const instruction = asInstructionFile(file("rules.pdf"));
    expect(missingScriptSampleGaps([instruction])).toEqual(["input", "output"]);
    expect(
      missingScriptSampleGaps([
        instruction,
        file("raw.xlsx"),
        asOutputSampleFile(file("expected.xlsx")),
      ])
    ).toEqual([]);
  });

  it("publish block mentions instruction when only reference attached", () => {
    const block = scriptSamplesPublishBlock("worker", workerCaps, [], [], [
      asInstructionFile(file("rules.pdf")),
    ]);
    expect(block?.title).toBe("فایل‌های نمونه پردازش");
    expect(block?.message).toContain("فایل دستورالعمل");
    expect(block?.message).toContain("ورودی و خروجی");
  });

  it("counts already-uploaded agent files (edit mode) toward samples", () => {
    const existing = [
      { name: "ورودی-نمونه.xlsx", role: "runtime" as const },
      { name: "output-sample__out.xlsx", role: "output_sample" as const },
    ];
    expect(missingScriptSampleGaps(existing)).toEqual([]);
    expect(
      scriptSamplesPublishBlock("worker", workerCaps, [], [], existing)
    ).toBeNull();
  });
});
