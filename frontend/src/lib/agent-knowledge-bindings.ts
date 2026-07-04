import type { AgentKnowledgeBindings } from "@/types";

export const EMPTY_KNOWLEDGE_BINDINGS: AgentKnowledgeBindings = { dataset_ids: [] };

export function parseKnowledgeBindings(
  config?: Record<string, unknown> | null
): AgentKnowledgeBindings {
  const raw = config?.knowledge_bindings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { dataset_ids: [] };
  }
  const o = raw as Record<string, unknown>;
  return {
    dataset_ids: Array.isArray(o.dataset_ids) ? (o.dataset_ids as string[]) : [],
  };
}

export function mergeKnowledgeBindingsIntoConfig(
  config: Record<string, unknown> | null | undefined,
  bindings: AgentKnowledgeBindings
): Record<string, unknown> {
  return {
    ...(config ?? {}),
    knowledge_bindings: {
      dataset_ids: [...bindings.dataset_ids],
    },
  };
}
