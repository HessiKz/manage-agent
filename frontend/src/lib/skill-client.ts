/** API client for the Phase 2 skill library (platform_skills). */

import { api } from "@/lib/api";
import { handleApiError } from "@/lib/api-error-handler";
import {
  parseSupportUiScript,
  type SupportUiScript,
} from "@/lib/support-ui-script";

export type SkillScope = "platform" | "org" | "agent";

export type SkillStatus = "draft" | "active" | "archived";

export type SkillRead = {
  id: string;
  slug: string;
  name: string;
  name_fa?: string | null;
  description?: string | null;
  scope: SkillScope;
  agent_id?: string | null;
  source: string;
  status: SkillStatus;
  version: number;
  trigger: Record<string, unknown>;
  procedure: unknown;
  content_md?: string | null;
  stats: { success_count: number; failure_count: number; last_used_at: string | null };
};

export type SkillMatchResult = {
  skill: SkillRead | null;
  confidence: number;
  reasons: string[];
};

export async function fetchSkills(params?: {
  scope?: SkillScope;
  status?: SkillStatus;
}): Promise<SkillRead[]> {
  const { data } = await api.get<unknown>("/skills", {
    params: { scope: params?.scope, status: params?.status },
  });
  // The endpoint returns a Page<SkillRead> ({ items, total, page, page_size }),
  // but a few call sites were written before pagination and accept either shape.
  if (Array.isArray(data)) return data as SkillRead[];
  if (data && typeof data === "object" && Array.isArray((data as any).items)) {
    return (data as { items: SkillRead[] }).items;
  }
  return [];
}

export async function fetchSkill(slug: string): Promise<SkillRead> {
  const { data } = await api.get<SkillRead>(`/skills/${slug}`);
  return data;
}

export async function createSkill(payload: Partial<SkillRead>): Promise<SkillRead> {
  const { data } = await api.post<SkillRead>("/skills", payload);
  return data;
}

export async function updateSkill(
  slug: string,
  payload: Partial<SkillRead>,
): Promise<SkillRead> {
  const { data } = await api.put<SkillRead>(`/skills/${slug}`, payload);
  return data;
}

export async function activateSkill(slug: string): Promise<SkillRead> {
  const { data } = await api.post<SkillRead>(`/skills/${slug}/activate`);
  return data;
}

export async function matchSkill(context: {
  run_state: Record<string, unknown>;
  message: string;
  pathname: string;
  autonomy_level?: number;
}): Promise<SkillMatchResult> {
  const { data } = await api.post<SkillMatchResult>("/skills/match", context);
  return data;
}

export async function recordSkillOutcome(
  slug: string,
  success: boolean,
): Promise<void> {
  await api.post(`/skills/${slug}/record-outcome`, { success });
}

/** Attach a resolving platform skill to a recurring failure pattern (admin). */
export async function linkFailureToSkill(
  patternHash: string,
  skillId: string,
): Promise<void> {
  await api.put(`/failures/link/${patternHash}`, { skill_id: skillId });
}

export type FailureRootCauseTag =
  | "slug_hallucination"
  | "permissions_ui"
  | "blocker_misdetect"
  | "wizard_step_rewind"
  | "agent_not_found"
  | "planning_stuck"
  | "widget_disabled"
  | "network"
  | "sandbox_oom"
  | "sandbox_timeout"
  | "sandbox_import_denied"
  | "sandbox_empty_output"
  | "sandbox_partial"
  | "unknown";

export type RecommendedFix = {
  type?: "skill" | "user_action" | "tool";
  message_fa?: string | null;
  skill_slug?: string | null;
  tool?: string | null;
};

export type FailureRead = {
  pattern_hash: string;
  scope: string;
  phase?: string | null;
  pathname_prefix?: string | null;
  tool_name?: string | null;
  root_cause_tag: FailureRootCauseTag;
  recommended_fix: RecommendedFix | Record<string, unknown>;
  occurrence_count: number;
  last_seen_at: string;
  resolved_by_skill_id?: string | null;
  sample_redacted?: string | null;
};

/** Admin view: top recurring failure patterns by occurrence_count. */
export async function fetchTopFailures(limit = 20): Promise<FailureRead[]> {
  const { data } = await api.get<FailureRead[]>("/failures/top", {
    params: { limit },
  });
  return data;
}

/** Read a stored procedure as a runnable SupportUiScript. */
export function skillProcedureToScript(
  procedure: unknown,
): SupportUiScript | undefined {
  return parseSupportUiScript(procedure);
}
