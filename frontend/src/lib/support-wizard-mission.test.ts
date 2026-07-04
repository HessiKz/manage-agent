import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildContinueTestingPayload,
  isWizardContinueIntent,
  isWizardCreateMissionIncomplete,
  isWizardTestingMissionIncomplete,
  readWizardStepIndex,
  shouldBlockWizardCreateWalk,
  storeWizardCreatePayload,
} from "@/lib/support-wizard-mission";

type El = {
  attrs: Record<string, string>;
  children: El[];
  className: string;
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  appendChild: (c: El) => El;
};

function installDom() {
  const bodyChildren: El[] = [];

  function makeEl(): El {
    const el: El = {
      attrs: {},
      children: [],
      className: "",
      setAttribute(k, v) {
        el.attrs[k] = v;
      },
      getAttribute(k) {
        return el.attrs[k] ?? null;
      },
      appendChild(c) {
        el.children.push(c);
        return c;
      },
    };
    return el;
  }

  function descendants(el: El): El[] {
    const out: El[] = [];
    for (const c of el.children) out.push(c, ...descendants(c));
    return out;
  }

  function match(el: El, sel: string): boolean {
    if (sel.includes("wizard-step-tab-") && sel.includes("aria-current")) {
      return (
        (el.attrs["data-ma-support"] ?? "").startsWith("wizard-step-tab-") &&
        el.attrs["aria-current"] === "step"
      );
    }
    if (sel.startsWith('[data-ma-support^="wizard-step-tab-"]')) {
      return (el.attrs["data-ma-support"] ?? "").startsWith("wizard-step-tab-");
    }
    const m = sel.match(/^\[data-ma-support="([^"]+)"\]$/);
    if (m) return el.attrs["data-ma-support"] === m[1];
    return false;
  }

  function all(sel: string): El[] {
    const out: El[] = [];
    for (const el of bodyChildren) {
      if (match(el, sel)) out.push(el);
      for (const d of descendants(el)) if (match(d, sel)) out.push(d);
    }
    return out;
  }

  vi.stubGlobal("document", {
    body: {
      appendChild(el: El) {
        bodyChildren.push(el);
        return el;
      },
      set innerHTML(_v: string) {
        bodyChildren.length = 0;
      },
    },
    createElement(_tag: string) {
      return makeEl();
    },
    querySelector(sel: string) {
      return all(sel)[0] ?? null;
    },
    querySelectorAll(sel: string) {
      return all(sel);
    },
  });

  return { makeEl, bodyChildren };
}

describe("support-wizard-mission", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
    });
    vi.stubGlobal("window", {
      location: { pathname: "/agents/create", search: "" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readWizardStepIndex uses aria-current, not brand color classes", () => {
    const { makeEl } = installDom();
    for (let i = 0; i < 6; i++) {
      const btn = makeEl();
      btn.setAttribute("data-ma-support", `wizard-step-tab-${i}`);
      if (i === 5) btn.setAttribute("aria-current", "step");
      const circle = makeEl();
      circle.className = "border-emerald-500 bg-emerald-500";
      btn.appendChild(circle);
      document.body.appendChild(btn);
    }
    expect(readWizardStepIndex()).toBe(5);
  });

  it("create mission is not incomplete on last step with bootstrap UI", () => {
    const { makeEl } = installDom();
    for (let i = 0; i < 6; i++) {
      const btn = makeEl();
      btn.setAttribute("data-ma-support", `wizard-step-tab-${i}`);
      if (i === 5) btn.setAttribute("aria-current", "step");
      document.body.appendChild(btn);
    }
    const loading = makeEl();
    loading.setAttribute("data-ma-support", "wizard-bootstrap-loading");
    document.body.appendChild(loading);

    expect(isWizardCreateMissionIncomplete("/agents/create")).toBe(false);
  });

  it("training panel means testing incomplete, not create incomplete", () => {
    const { makeEl } = installDom();
    for (let i = 0; i < 6; i++) {
      const btn = makeEl();
      btn.setAttribute("data-ma-support", `wizard-step-tab-${i}`);
      if (i === 5) btn.setAttribute("aria-current", "step");
      document.body.appendChild(btn);
    }
    const panel = makeEl();
    panel.setAttribute("data-ma-support", "training-panel");
    document.body.appendChild(panel);
    store.ma_wizard_created_slug = "my-agent";

    expect(isWizardCreateMissionIncomplete("/agents/create")).toBe(false);
    expect(isWizardTestingMissionIncomplete("/agents/create")).toBe(true);
  });

  it("continue-testing payload works without live form fields", () => {
    installDom();
    storeWizardCreatePayload({
      name: "ایجنت تست",
      description: "توضیح",
      department: "ops",
      kind: "chat",
    });
    const payload = buildContinueTestingPayload("agent-slug-1");
    expect(payload.agent_slug).toBe("agent-slug-1");
    expect(payload.name).toBe("ایجنت تست");
  });

  it("does not block create walk for stale session slug on early wizard steps", () => {
    const { makeEl } = installDom();
    for (let i = 0; i < 6; i++) {
      const btn = makeEl();
      btn.setAttribute("data-ma-support", `wizard-step-tab-${i}`);
      if (i === 0) btn.setAttribute("aria-current", "step");
      document.body.appendChild(btn);
    }
    store.ma_wizard_created_slug = "already-built";
    expect(shouldBlockWizardCreateWalk()).toBe(false);
    expect(isWizardCreateMissionIncomplete("/agents/create")).toBe(true);
  });

  it("does not block create walk for stale URL slug on early wizard steps", () => {
    const { makeEl } = installDom();
    for (let i = 0; i < 6; i++) {
      const btn = makeEl();
      btn.setAttribute("data-ma-support", `wizard-step-tab-${i}`);
      if (i === 0) btn.setAttribute("aria-current", "step");
      document.body.appendChild(btn);
    }
    vi.stubGlobal("window", {
      location: { pathname: "/agents/create", search: "?slug=old-agent" },
    });
    expect(shouldBlockWizardCreateWalk()).toBe(false);
    expect(isWizardCreateMissionIncomplete("/agents/create")).toBe(true);
  });

  it("detects continue intent in Persian", () => {
    expect(isWizardContinueIntent("ادامه بده")).toBe(true);
    expect(isWizardContinueIntent("continue")).toBe(true);
    expect(isWizardContinueIntent("یک ایجنت بساز")).toBe(false);
  });

  it("blocks create walk when URL has slug on last wizard step", () => {
    const { makeEl } = installDom();
    for (let i = 0; i < 6; i++) {
      const btn = makeEl();
      btn.setAttribute("data-ma-support", `wizard-step-tab-${i}`);
      if (i === 5) btn.setAttribute("aria-current", "step");
      document.body.appendChild(btn);
    }
    vi.stubGlobal("window", {
      location: { pathname: "/agents/create", search: "?slug=already-built" },
    });
    expect(shouldBlockWizardCreateWalk()).toBe(true);
  });
});
