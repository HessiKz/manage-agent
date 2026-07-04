import { describe, expect, it } from "vitest";
import { formatUiSnapshotForAgent, type UiSnapshot } from "@/lib/ui-snapshot";

describe("formatUiSnapshotForAgent", () => {
  it("includes blocker section and blocked flag when present", () => {
    const snap: UiSnapshot = {
      path: "/agents/create",
      search: "?step=0",
      title: "ساخت ایجنت",
      scrollY: 0,
      elementCount: 1,
      elements: [
        {
          ref: "ui-1",
          selector: '[data-ma-support="wizard-next"]',
          role: "button",
          label: "بعدی",
          tag: "button",
        },
      ],
      blockers: [
        {
          kind: "error",
          text: "دسترسی به این بخش مجاز نیست.",
          selector: '[data-ma-support="app-error"]',
        },
      ],
      blocked: true,
      blockerText: "دسترسی به این بخش مجاز نیست.",
      capturedAt: new Date().toISOString(),
    };

    const formatted = formatUiSnapshotForAgent(snap);
    expect(formatted).toContain("blocked: true");
    expect(formatted).toContain("مانع‌های UI");
    expect(formatted).toContain("دسترسی به این بخش مجاز نیست");
    expect(formatted).toContain("?step=0");
  });

  it("omits blocker section when empty", () => {
    const snap: UiSnapshot = {
      path: "/dashboard",
      search: "",
      title: "داشبورد",
      scrollY: 0,
      elementCount: 0,
      elements: [],
      blockers: [],
      blocked: false,
      blockerText: "",
      capturedAt: new Date().toISOString(),
    };
    const formatted = formatUiSnapshotForAgent(snap);
    expect(formatted).toContain("blocked: false");
    expect(formatted).not.toContain("مانع‌های UI");
  });
});
