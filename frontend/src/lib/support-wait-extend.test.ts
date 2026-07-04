import { describe, expect, it } from "vitest";
import { formatWaitClock } from "@/lib/support-wait-extend";

describe("formatWaitClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatWaitClock(0)).toBe("0:00");
    expect(formatWaitClock(65)).toBe("1:05");
    expect(formatWaitClock(300)).toBe("5:00");
  });
});
