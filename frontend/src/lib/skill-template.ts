/** Resolve {{run_state.slug}} style template tokens in a SupportUiScript.
 *
 * Mirrors backend src/core/skill_template.py: pure string substitution,
 * only known keys, reject unknown tokens. Never calls an LLM.
 */

import type { SupportUiScript } from "@/lib/support-ui-script";

export type SkillTemplateContext = {
  run_state?: Record<string, unknown>;
  user?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

const KNOWN_KEYS = new Set([
  "run_state.slug",
  "run_state.phase",
  "run_state.pathname",
  "user.id",
  "payload.name",
]);

function lookup(ctx: SkillTemplateContext, key: string): string | undefined {
  const [head, ...rest] = key.split(".");
  if (head === "run_state") {
    return ctx.run_state?.[rest.join(".")] !== undefined
      ? String(ctx.run_state?.[rest.join(".")])
      : undefined;
  }
  if (head === "user") {
    return ctx.user?.[rest.join(".")] !== undefined
      ? String(ctx.user?.[rest.join(".")])
      : undefined;
  }
  if (head === "payload") {
    return ctx.payload?.[rest.join(".")] !== undefined
      ? String(ctx.payload?.[rest.join(".")])
      : undefined;
  }
  return undefined;
}

/** Throws on unknown {{...}} tokens. Returns a resolved copy of the script. */
export function resolveTemplate(
  script: SupportUiScript,
  ctx: SkillTemplateContext,
): SupportUiScript {
  const resolveText = (text: string): string => {
    return text.replace(/\{\{([^}]+)\}\}/g, (_m, raw: string) => {
      const key = raw.trim();
      if (!KNOWN_KEYS.has(key)) {
        throw new Error(`Unknown skill template token: {{${key}}}`);
      }
      const val = lookup(ctx, key);
      if (val === undefined) {
        throw new Error(`Skill template token has no value: {{${key}}}`);
      }
      return val;
    });
  };

  const steps = script.steps.map((step) => {
    const out: Record<string, unknown> = { ...step };
    const maybeLabel = (step as { label?: unknown }).label;
    if (typeof maybeLabel === "string") out.label = resolveText(maybeLabel);
    const maybeText = (step as { text?: unknown }).text;
    if (typeof maybeText === "string") out.text = resolveText(maybeText);
    const maybePath = (step as { path?: unknown }).path;
    if (typeof maybePath === "string") out.path = resolveText(maybePath);
    const maybePayload = (step as { payload?: unknown }).payload;
    if (maybePayload && typeof maybePayload === "object") {
      out.payload = JSON.parse(resolveText(JSON.stringify(maybePayload)));
    }
    return out as SupportUiScript["steps"][number];
  });

  return { label: resolveTemplateText(script.label), steps };
}

function resolveTemplateText(text: string): string {
  return resolveTemplateTextInner(text);
}

function resolveTemplateTextInner(text: string): string {
  const ctx: SkillTemplateContext = {};
  return text.replace(/\{\{([^}]+)\}\}/g, (_m, raw: string) => {
    const key = raw.trim();
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(`Unknown skill template token: {{${key}}}`);
    }
    return lookup(ctx, key) ?? "";
  });
}