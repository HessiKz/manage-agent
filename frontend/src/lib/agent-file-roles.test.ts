import { describe, expect, it } from "vitest";
import {
  agentFileRoleFromName,
  asInputSampleFile,
  asOutputSampleFile,
  isTrainingInputFileName,
  roleBadgeLabel,
} from "@/lib/agent-file-roles";

describe("agent-file-roles", () => {
  it("detects roles from prefixes", () => {
    expect(agentFileRoleFromName("output-sample__x.xlsx")).toBe("output_sample");
    expect(agentFileRoleFromName("instruction__a.md")).toBe("instruction");
    expect(agentFileRoleFromName("input-sample__a.csv")).toBe("input_sample");
    expect(agentFileRoleFromName("raw.xlsx")).toBe("runtime");
  });

  it("training input excludes instruction/output samples", () => {
    expect(isTrainingInputFileName("raw.xlsx")).toBe(true);
    expect(isTrainingInputFileName("output-sample__x.xlsx")).toBe(false);
  });

  it("prefixes wrappers", () => {
    const f = new File(["x"], "a.xlsx");
    expect(asOutputSampleFile(f).name.startsWith("output-sample__")).toBe(true);
    expect(asInputSampleFile(f).name.startsWith("input-sample__")).toBe(true);
    expect(roleBadgeLabel("output_sample")).toContain("خروجی");
  });
});
