import { describe, expect, it, vi, afterEach } from "vitest";
import {
  inspectWizardCreatePage,
  wizardObservationDirective,
} from "@/lib/support-page-state";

describe("support-page-state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("directs continue-testing when slug exists, not create", () => {
    vi.stubGlobal("document", {
      querySelector: (sel: string) => {
        if (sel === '[data-ma-support="wizard-planning-questions"]') return {};
        return null;
      },
      querySelectorAll: () => [],
    });

    expect(inspectWizardCreatePage("/agents/create")).toBe("testing_planning");
    const hint = wizardObservationDirective("/agents/create");
    expect(hint).toContain("platform_continue_agent_testing");
    expect(hint).toContain("هرگز");
  });

  it("ignores stale session slug when wizard steps are incomplete", () => {
    const tab = { querySelector: () => null };
    vi.stubGlobal("document", {
      querySelector: () => null,
      querySelectorAll: (sel: string) => {
        if (sel === '[data-ma-support^="wizard-step-tab-"]') {
          return [tab, tab, tab, tab, tab, tab];
        }
        return [];
      },
    });
    vi.stubGlobal("window", {
      location: { pathname: "/agents/create", search: "" },
    });
    vi.stubGlobal("sessionStorage", { getItem: () => "old-agent-slug" });

    expect(inspectWizardCreatePage("/agents/create")).toBe("wizard_steps_incomplete");
    const hint = wizardObservationDirective("/agents/create");
    expect(hint).toContain("platform_create_agent");
  });
});
