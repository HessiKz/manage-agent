/** Visual UI automation script returned by the support agent (no silent background work). */

type UiTarget = { selector?: string; ref?: string };

export type SupportUiStep =
  | { type: "navigate"; path: string; label?: string }
  | { type: "wait"; ms: number }
  | { type: "wait_for_path"; pattern: string; timeout_ms?: number; label?: string }
  | ({ type: "wait_for_dom"; timeout_ms?: number; label?: string } & UiTarget)
  | ({ type: "highlight"; label?: string } & UiTarget)
  | ({ type: "click"; label?: string } & UiTarget)
  | ({ type: "type"; text: string; label?: string } & UiTarget)
  | ({ type: "select"; value: string; label?: string } & UiTarget)
  | { type: "bridge"; action: string; payload?: Record<string, unknown>; label?: string };

function readUiTarget(s: Record<string, unknown>): UiTarget | null {
  const ref = typeof s.ref === "string" ? s.ref : undefined;
  const selector = typeof s.selector === "string" ? s.selector : undefined;
  if (!ref && !selector) return null;
  return { ref, selector };
}

export type SupportPlayProgress = {
  step: number;
  total: number;
  label: string;
  scriptLabel: string;
};

export type SupportUiScript = {
  label: string;
  steps: SupportUiStep[];
};

export function parseSupportUiScript(raw: unknown): SupportUiScript | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label : "در حال انجام…";
  const stepsRaw = o.steps;
  if (!Array.isArray(stepsRaw) || !stepsRaw.length) return undefined;

  const steps: SupportUiStep[] = [];
  for (const item of stepsRaw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const type = s.type;
    if (type === "navigate" && typeof s.path === "string") {
      steps.push({ type: "navigate", path: s.path, label: typeof s.label === "string" ? s.label : undefined });
    } else if (type === "wait" && typeof s.ms === "number") {
      steps.push({ type: "wait", ms: s.ms });
    } else if (type === "wait_for_path" && typeof s.pattern === "string") {
      steps.push({
        type: "wait_for_path",
        pattern: s.pattern,
        timeout_ms: typeof s.timeout_ms === "number" ? s.timeout_ms : undefined,
        label: typeof s.label === "string" ? s.label : undefined,
      });
    } else if (type === "wait_for_dom") {
      const target = readUiTarget(s);
      if (!target) continue;
      steps.push({
        type: "wait_for_dom",
        ...target,
        timeout_ms: typeof s.timeout_ms === "number" ? s.timeout_ms : undefined,
        label: typeof s.label === "string" ? s.label : undefined,
      });
    } else if (type === "highlight") {
      const target = readUiTarget(s);
      if (!target) continue;
      steps.push({
        type: "highlight",
        ...target,
        label: typeof s.label === "string" ? s.label : undefined,
      });
    } else if (type === "click") {
      const target = readUiTarget(s);
      if (!target) continue;
      steps.push({
        type: "click",
        ...target,
        label: typeof s.label === "string" ? s.label : undefined,
      });
    } else if (type === "type" && typeof s.text === "string") {
      const target = readUiTarget(s);
      if (!target) continue;
      steps.push({
        type: "type",
        ...target,
        text: s.text,
        label: typeof s.label === "string" ? s.label : undefined,
      });
    } else if (type === "select" && typeof s.value === "string") {
      const target = readUiTarget(s);
      if (!target) continue;
      steps.push({
        type: "select",
        ...target,
        value: s.value,
        label: typeof s.label === "string" ? s.label : undefined,
      });
    } else if (type === "bridge" && typeof s.action === "string") {
      steps.push({
        type: "bridge",
        action: s.action,
        payload:
          s.payload && typeof s.payload === "object" && !Array.isArray(s.payload)
            ? (s.payload as Record<string, unknown>)
            : undefined,
        label: typeof s.label === "string" ? s.label : undefined,
      });
    }
  }

  if (!steps.length) return undefined;
  return { label, steps };
}
