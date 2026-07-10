/** Authoritative run state client. API wins over sessionStorage (read-through). */

import { api } from "@/lib/api";

export type RunStateScopeType = "wizard" | "support" | "invoke";

export interface RunStatePayload {
  agent_slug_verified?: boolean;
  last_tool?: string;
  last_tool_success?: boolean;
  attempt_counts?: Record<string, number>;
  user_choices?: Record<string, boolean>;
  autonomy_level?: number;
  execution_precision?: string;
  source_of_slug?: "api" | "url" | "session";
  [key: string]: unknown;
}

export interface RunState {
  id: string | null;
  scope_type: RunStateScopeType;
  scope_key: string;
  user_id: string;
  agent_id: string | null;
  slug: string | null;
  phase: string;
  wizard_step_index: number | null;
  payload: RunStatePayload;
  version: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface RunStateScope {
  type: RunStateScopeType;
  key: string;
}

const SESSION_PREFIX = "ma_run_state:";

function emptyState(scope: RunStateScope): RunState {
  return {
    id: null,
    scope_type: scope.type,
    scope_key: scope.key,
    user_id: "",
    agent_id: null,
    slug: null,
    phase: "unknown",
    wizard_step_index: null,
    payload: {},
    version: 0,
    created_at: null,
    updated_at: null,
  };
}

function readSession(scope: RunStateScope): RunState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + scope.key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RunState;
    return {
      ...emptyState(scope),
      ...parsed,
      slug: parsed.slug ?? null,
      payload: parsed.payload ?? {},
    };
  } catch {
    return null;
  }
}

function writeSession(state: RunState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_PREFIX + state.scope_key, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

/** Active support thread id, else the ma wizard session key. */
export function wizardScopeKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const active = window.sessionStorage.getItem("ma_wizard_session_id");
    if (active) return active;
  } catch {
    /* ignore */
  }
  const urlSlug = new URLSearchParams(window.location.search).get("slug");
  if (urlSlug) return `agent:${urlSlug}`;
  return "session:" + (window.location.pathname || "unknown");
}

export async function getRunState(scope: RunStateScope): Promise<RunState> {
  const fallback = readSession(scope);
  try {
    const { data } = await api.get<RunState>(
      `/run-state/${scope.type}/${encodeURIComponent(scope.key)}`
    );
    writeSession(data);
    return data;
  } catch {
    // API unavailable (offline / 404 default) — fall back to session, marking slug unverified.
    if (fallback) return { ...fallback, payload: { ...fallback.payload, agent_slug_verified: false } };
    return emptyState(scope);
  }
}

export async function putRunState(
  scope: RunStateScope,
  body: {
    phase?: string;
    slug?: string | null;
    wizard_step_index?: number | null;
    agent_id?: string | null;
    payload?: RunStatePayload;
    version?: number;
  }
): Promise<RunState> {
  const { data } = await api.put<RunState>(
    `/run-state/${scope.type}/${encodeURIComponent(scope.key)}`,
    { scope_type: scope.type, scope_key: scope.key, ...body }
  );
  writeSession(data);
  return data;
}

export async function patchRunState(
  scope: RunStateScope,
  patch: {
    phase?: string;
    slug?: string | null;
    wizard_step_index?: number | null;
    payload?: RunStatePayload;
  }
): Promise<RunState> {
  const { data } = await api.patch<RunState>(
    `/run-state/${scope.type}/${encodeURIComponent(scope.key)}`,
    patch
  );
  writeSession(data);
  return data;
}

export async function deleteRunState(scope: RunStateScope): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SESSION_PREFIX + scope.key);
    } catch {
      /* ignore */
    }
  }
  await api.delete(`/run-state/${scope.type}/${encodeURIComponent(scope.key)}`);
}
