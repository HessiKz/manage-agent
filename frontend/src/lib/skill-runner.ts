/** Runtime: match a stored skill to the current context and run it before the LLM.
 *
 * Mirrors Annex B of the Phase 2 plan: read run_state -> POST /skills/match
 * -> if confidence >= 0.75 and autonomy >= L2, resolve templates and play
 * the procedure (no LLM), then record the outcome.
 */

import { resolveTemplate } from "@/lib/skill-template";
import {
  matchSkill,
  recordSkillOutcome,
  skillProcedureToScript,
  type SkillRead,
} from "@/lib/skill-client";
import type { SupportUiScript } from "@/lib/support-ui-script";

export type SkillRunResult = "ran" | "no_match" | "failed" | "disabled";

const MIN_EXECUTE_CONFIDENCE = 0.75;
const MIN_AUTO_RUN_AUTONOMY = 2;

export function skillLibraryEnabled(): boolean {
  // Skill runner is gated by the SKILL_LIBRARY_V1 flag on the backend.
  // When the flag is off the /skills/match endpoint returns no matches,
  // so we still guard the network call cheaply here.
  return true;
}

export async function matchAndRunSkill(ctx: {
  runState: Record<string, unknown>;
  message: string;
  pathname: string;
  autonomyLevel?: number;
  playScript: (
    script: SupportUiScript,
    opts?: {
      onProgress?: (p: {
        step: number;
        total: number;
        label: string;
        scriptLabel: string;
      }) => void;
    },
  ) => Promise<void>;
}): Promise<SkillRunResult> {
  const level = ctx.autonomyLevel ?? 1;

  let match: { skill: SkillRead | null; confidence: number; reasons: string[] } | null =
    null;
  try {
    match = await matchSkill({
      run_state: ctx.runState,
      message: ctx.message,
      pathname: ctx.pathname,
      autonomy_level: level,
    });
  } catch {
    return "no_match";
  }
  if (!match?.skill) return "no_match";

  const skill = match.skill;
  const script = skillProcedureToScript(skill.procedure);
  if (!script) return "no_match";

  // Below threshold or autonomy too low: suggest (no auto-run). The assistant
  // can surface skill.slug to the user; we do not execute.
  if (match.confidence < MIN_EXECUTE_CONFIDENCE || level < MIN_AUTO_RUN_AUTONOMY) {
    return "no_match";
  }

  const resolved = resolveTemplate(script, {
    run_state: ctx.runState,
    user: { id: String(ctx.runState["user_id"] ?? "") },
    payload: (ctx.runState["payload"] as Record<string, unknown>) ?? {},
  });

  try {
    await ctx.playScript(resolved);
    await recordSkillOutcome(skill.slug, true).catch(() => undefined);
    return "ran";
  } catch {
    await recordSkillOutcome(skill.slug, false).catch(() => undefined);
    return "failed";
  }
}