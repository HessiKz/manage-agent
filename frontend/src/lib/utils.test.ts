import { describe, expect, it } from "vitest";
import { deptLabel, statusLabel } from "@/lib/utils";

describe("utils", () => {
  it("translates department labels", () => {
    expect(deptLabel("finance")).toBe("مالی");
    expect(deptLabel("hr")).toBe("منابع انسانی");
  });

  it("translates agent status", () => {
    expect(statusLabel("active")).toBe("فعال");
    expect(statusLabel("draft")).toBe("پیش‌نویس");
  });

  it("keeps unknown labels stable", () => {
    expect(deptLabel("unknown")).toBe("unknown");
    expect(statusLabel("unknown")).toBe("unknown");
  });
});
