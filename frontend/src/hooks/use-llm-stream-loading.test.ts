import { describe, expect, it } from "vitest";
import { buildThinkingSnapshot } from "@/hooks/use-llm-stream-loading";

describe("buildThinkingSnapshot", () => {
  it("returns structured thinking with summary and phase", () => {
    const snap = buildThinkingSnapshot("ابتدا فایل را می‌خوانم. سپس خلاصه می‌کنم.", "thinking");
    expect(snap?.content).toContain("ابتدا");
    expect(snap?.summary).toContain("ابتدا");
    expect(snap?.phase).toBe("thinking");
  });

  it("returns undefined for empty content", () => {
    expect(buildThinkingSnapshot("   ")).toBeUndefined();
  });
});
