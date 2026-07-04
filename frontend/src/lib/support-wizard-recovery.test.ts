import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ensurePermissionsDefault,
  formatRecoveryUserPrompt,
  isPermissionsStepReady,
} from "@/lib/support-wizard-recovery";

describe("formatRecoveryUserPrompt", () => {
  it("asks user for help after automated recovery fails", () => {
    const msg = formatRecoveryUserPrompt("حداقل یک کاربر را انتخاب کنید");
    expect(msg).toContain("حداقل یک کاربر");
    expect(msg).toContain("راه‌حل خودکار");
  });
});

describe("ensurePermissionsDefault", () => {
  let allowDefault = false;
  let inputChecked = false;
  let clickCount = 0;
  let defaultInput: { checked: boolean; click: () => void };

  beforeEach(() => {
    allowDefault = false;
    inputChecked = false;
    clickCount = 0;

    defaultInput = {
      get checked() {
        return inputChecked;
      },
      set checked(v: boolean) {
        inputChecked = v;
      },
      click() {
        clickCount += 1;
        // Controlled-checkbox trap: click flips against React state.
        inputChecked = !allowDefault;
      },
    };

    vi.stubGlobal("document", {
      querySelector(sel: string) {
        if (String(sel).includes("wizard-permissions-default")) return defaultInput;
        return null;
      },
      querySelectorAll() {
        return [];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses React setter and does not toggle checkbox off via click", async () => {
    const setPermissionsAllowDefault = vi.fn((value: boolean) => {
      allowDefault = value;
      inputChecked = value;
    });

    const ok = await ensurePermissionsDefault(null, { setPermissionsAllowDefault });

    expect(ok).toBe(true);
    expect(setPermissionsAllowDefault).toHaveBeenCalledWith(true);
    expect(allowDefault).toBe(true);
    expect(inputChecked).toBe(true);
    expect(clickCount).toBe(0);
    expect(isPermissionsStepReady()).toBe(true);
  });

  it("returns true when setter is present even if checkbox mounts late", async () => {
    vi.stubGlobal("document", {
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    });

    const setPermissionsAllowDefault = vi.fn();
    const ok = await ensurePermissionsDefault(null, { setPermissionsAllowDefault });
    expect(ok).toBe(true);
    expect(setPermissionsAllowDefault).toHaveBeenCalledWith(true);
  });
});
