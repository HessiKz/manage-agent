import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("resolveTestingSlug", () => {
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
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("prefers URL and session over hallucinated payload slug", async () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/agents/create",
        search: "?slug=yjnt-jdyd-21",
        href: "http://x/agents/create?slug=yjnt-jdyd-21",
      },
    });
    store.ma_wizard_created_slug = "yjnt-jdyd-21";

    const { resolveTestingSlug } = await import("@/hooks/use-testing-support-bridge");
    expect(
      resolveTestingSlug({ agent_slug: "yjnt-jdyd-22", name: "ایجنت جدید 22" })
    ).toBe("yjnt-jdyd-21");
  });

  it("uses session when URL empty, not payload guess", async () => {
    vi.stubGlobal("window", {
      location: { pathname: "/agents/create", search: "", href: "http://x/agents/create" },
    });
    store.ma_wizard_created_slug = "yjnt-jdyd-21";

    const { resolveTestingSlug } = await import("@/hooks/use-testing-support-bridge");
    expect(resolveTestingSlug({ agent_slug: "yjnt-jdyd-22" })).toBe("yjnt-jdyd-21");
  });
});
