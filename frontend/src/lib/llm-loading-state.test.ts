import { describe, expect, it } from "vitest";
import { summarizeThinking, normalizeStreamPhase } from "@/lib/llm-loading-state";

describe("llm-loading-state", () => {
  it("summarizes thinking to first sentence", () => {
    const text = "ابتدا باید فایل را بخوانم. سپس خلاصه می‌کنم.";
    expect(summarizeThinking(text)).toBe("ابتدا باید فایل را بخوانم");
  });

  it("returns default when thinking empty", () => {
    expect(summarizeThinking("   ")).toContain("تحلیل");
  });

  it("normalizes backend phases", () => {
    expect(normalizeStreamPhase("agent_run")).toBe("tools");
    expect(normalizeStreamPhase("reasoning_complete")).toBe("generating");
  });
});
