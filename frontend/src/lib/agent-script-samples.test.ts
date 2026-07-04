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
    expect(agentLikelyNeedsScript("worker", workerCaps, ["karkard_process"], [])).toBe(false);
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
    expect(block?.message).toContain("فایل و سیاست");
  });
});
