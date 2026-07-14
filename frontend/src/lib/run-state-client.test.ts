import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({ api: apiMock }));

import type { RunState, RunStateScope } from "@/lib/run-state-client";
import { getRunState, putRunState, patchRunState, deleteRunState, wizardScopeKey } from "@/lib/run-state-client";

const scope: RunStateScope = { type: "wizard", key: "sess-123" };

const store: Record<string, string> = {};

function fakeState(over: Partial<RunState> = {}): RunState {
  return {
    id: "id-1",
    scope_type: "wizard",
    scope_key: "sess-123",
    user_id: "u-1",
    agent_id: null,
    slug: null,
    phase: "unknown",
    wizard_step_index: null,
    payload: {},
    version: 1,
    created_at: null,
    updated_at: null,
    ...over,
  };
}

describe("run-state-client", () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.clearAllMocks();
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
      sessionStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getRunState returns API state and wins over session", async () => {
    apiMock.get.mockResolvedValue({ data: fakeState({ slug: "verified-slug", phase: "training" }) });
    store["ma_run_state:sess-123"] = JSON.stringify(fakeState({ slug: "session-slug" }));

    const result = await getRunState(scope);
    expect(result.slug).toBe("verified-slug");
    expect(apiMock.get).toHaveBeenCalledWith("/run-state/wizard/sess-123");
  });

  it("getRunState falls back to session with verified=false when API fails", async () => {
    apiMock.get.mockRejectedValue(new Error("network"));
    store["ma_run_state:sess-123"] = JSON.stringify(fakeState({ slug: "fallback-slug" }));
    const result = await getRunState(scope);
    expect(result.slug).toBe("fallback-slug");
    expect(result.payload.agent_slug_verified).toBe(false);
  });

  it("putRunState sends scoped body and caches result", async () => {
    apiMock.put.mockResolvedValue({ data: fakeState({ phase: "training", slug: "abc" }) });
    const res = await putRunState(scope, { phase: "training", slug: "abc" });
    expect(res.phase).toBe("training");
    expect(apiMock.put).toHaveBeenCalledWith(
      "/run-state/wizard/sess-123",
      expect.objectContaining({ scope_type: "wizard", scope_key: "sess-123", phase: "training" })
    );
    expect(store["ma_run_state:sess-123"]).toContain("training");
  });

  it("patchRunState calls API with payload", async () => {
    apiMock.patch.mockResolvedValue({
      data: fakeState({ payload: { attempt_counts: { continue_testing: 2 } } }),
    });
    await patchRunState(scope, { payload: { attempt_counts: { continue_testing: 2 } } });
    expect(apiMock.patch).toHaveBeenCalledWith("/run-state/wizard/sess-123", {
      payload: { attempt_counts: { continue_testing: 2 } },
    });
  });

  it("deleteRunState clears session and calls api", async () => {
    apiMock.delete.mockResolvedValue({});
    store["ma_run_state:sess-123"] = JSON.stringify(fakeState());
    await deleteRunState(scope);
    expect(apiMock.delete).toHaveBeenCalledWith("/run-state/wizard/sess-123");
    expect(store["ma_run_state:sess-123"]).toBeUndefined();
  });

  it("wizardScopeKey prefers session id", () => {
    store["ma_wizard_session_id"] = "wiz-sess-9";
    expect(wizardScopeKey()).toBe("wiz-sess-9");
  });
});