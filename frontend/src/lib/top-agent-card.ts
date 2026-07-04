import { DEFAULT_FILE_POLICY, KIND_PRESETS } from "@/lib/agent-presets";
import type { Agent, TopAgent } from "@/types";

const POPULAR_AGENT_LIMIT = 8;

/** Build a minimal Agent shape for AgentCard from top-agents API row. */
export function agentFromTopAgent(top: TopAgent): Agent {
  const created = top.created_at ?? new Date(0).toISOString();
  return {
    id: top.id,
    name: top.name,
    slug: top.slug,
    description: top.description ?? "",
    department: top.department,
    status: "active",
    kind: "worker",
    capabilities: KIND_PRESETS.chat,
    file_policy: DEFAULT_FILE_POLICY,
    agent_link_policy: { max_depth: 3, default_requires_user_permission: true },
    model_provider: "",
    model_name: "",
    temperature: 0,
    tool_names: [],
    created_at: created,
    updated_at: created,
  };
}

export function pickPopularAgents(topAgents: TopAgent[]): {
  agent: Agent;
  runs: number;
  isNew: boolean;
}[] {
  const slice = topAgents.slice(0, POPULAR_AGENT_LIMIT);
  if (slice.length === 0) return [];

  let newestId = slice[0]!.id;
  let newestAt = new Date(slice[0]!.created_at ?? 0).getTime();
  for (const row of slice) {
    const at = new Date(row.created_at ?? 0).getTime();
    if (at > newestAt) {
      newestAt = at;
      newestId = row.id;
    }
  }

  return slice.map((row) => ({
    agent: agentFromTopAgent(row),
    runs: row.runs,
    isNew: row.id === newestId,
  }));
}

export { POPULAR_AGENT_LIMIT };
