/** Helpers for action input_schema + prompt (no {{}} in the wizard UI). */

export type ActionInputField = {
  key: string;
  label: string;
  type: "string" | "integer" | "boolean";
  defaultValue?: string;
};

const PROMPT_MARKER = "\n<!--ma-inputs-->\n";

const LABEL_TO_KEY: Record<string, string> = {
  دوره: "period",
  "سال شمسی": "jalali_year",
  سال: "jalali_year",
  نقش: "role",
  "نام شرکت": "company_name",
};

export function getInputProperties(
  schema: Record<string, unknown> | undefined
): Record<string, { title?: string; type?: string; default?: unknown }> {
  if (!schema || typeof schema !== "object") return {};
  const nested = schema.properties;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, { title?: string; type?: string; default?: unknown }>;
  }
  const skip = new Set(["properties", "required", "type", "$schema"]);
  return Object.fromEntries(
    Object.entries(schema).filter(([k, v]) => !skip.has(k) && v && typeof v === "object")
  ) as Record<string, { title?: string; type?: string; default?: unknown }>;
}

export function schemaToFields(schema: Record<string, unknown> | undefined): ActionInputField[] {
  const props = getInputProperties(schema);
  return Object.entries(props).map(([key, meta]) => ({
    key,
    label: String(meta.title ?? key),
    type:
      meta.type === "integer" || meta.type === "number"
        ? "integer"
        : meta.type === "boolean"
          ? "boolean"
          : "string",
    defaultValue:
      meta.default !== undefined && meta.default !== null ? String(meta.default) : undefined,
  }));
}

export function fieldsToSchema(fields: ActionInputField[]): Record<string, unknown> {
  if (fields.length === 0) return {};
  const properties: Record<string, unknown> = {};
  for (const f of fields) {
    const entry: Record<string, unknown> = {
      type: f.type,
      title: f.label,
    };
    if (f.defaultValue !== undefined && f.defaultValue !== "") {
      if (f.type === "integer") entry.default = Number(f.defaultValue) || 0;
      else if (f.type === "boolean") entry.default = f.defaultValue === "true";
      else entry.default = f.defaultValue;
    }
    properties[f.key] = entry;
  }
  return { properties };
}

export function keyFromLabel(label: string, used: Set<string>): string {
  const trimmed = label.trim();
  let base = LABEL_TO_KEY[trimmed];
  if (!base) {
    base = trimmed
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_\u0600-\u06FF]/g, "");
    if (!base || /^[\u0600-\u06FF_]+$/.test(base)) {
      base = `input_${used.size + 1}`;
    }
  }
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${n++}`;
  }
  return candidate;
}

export function splitUserPrompt(full: string): string {
  const idx = full.indexOf(PROMPT_MARKER);
  if (idx === -1) return full;
  return full.slice(0, idx);
}

export function finalizeActionPrompt(userPrompt: string, schema: Record<string, unknown>): string {
  const trimmed = userPrompt.trim();
  const props = getInputProperties(schema);
  const keys = Object.keys(props);
  if (keys.length === 0) return trimmed;
  const lines = keys.map((k) => {
    const title = props[k]?.title ?? k;
    return `${title}: {{${k}}}`;
  });
  return `${trimmed}${PROMPT_MARKER}${lines.join("\n")}`;
}

export function slugFromActionLabel(label: string, index: number): string {
  const trimmed = label.trim();
  if (!trimmed) return `action_${index + 1}`;
  const ascii = trimmed
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  if (ascii.length >= 2) return ascii;
  return `action_${index + 1}`;
}

export function deriveAgentToolNames(actions: import("@/types").AgentAction[]): string[] {
  return [...new Set(actions.flatMap((a) => a.tool_chain ?? []).filter(Boolean))];
}

export function prepareActionsForPublish(actions: import("@/types").AgentAction[]) {
  const toolNames = deriveAgentToolNames(actions);
  return actions.map((act, i) => {
    const schema = fieldsToSchema(schemaToFields(act.input_schema));
    const slug =
      act.id && act.slug?.trim()
        ? act.slug.trim()
        : slugFromActionLabel(act.label, i) || act.slug;
    return {
      ...act,
      slug,
      input_schema: schema,
      prompt_template: finalizeActionPrompt(splitUserPrompt(act.prompt_template), schema),
      tool_chain: act.tool_chain?.length ? act.tool_chain : toolNames,
      order_index: i,
    };
  });
}
