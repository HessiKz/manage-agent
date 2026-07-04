import {
  canonicalAgentKind,
  DEFAULT_FILE_POLICY,
  EMPTY_API_BINDINGS,
  KIND_PRESETS,
  parseApiBindings,
} from "@/lib/agent-presets";
import { parseWidgetPlan, type AgentWidgetPlan } from "@/lib/widget-plan";
import type {
  Agent,
  AgentAction,
  AgentApiBindings,
  AgentCapabilities,
  AgentFilePolicy,
  AgentKind,
  AgentLink,
  AgentLinkPolicy,
  AgentPermission,
  AgentPermissionGrantInput,
  AgentPromptTemplate,
} from "@/types";

export type AgentEditorDraft = {
  name: string;
  description: string;
  department: string;
  kind: AgentKind;
  capabilities: AgentCapabilities;
  filePolicy: AgentFilePolicy;
  linkPolicy: AgentLinkPolicy;
  systemPrompt: string;
  modelName: string;
  temperature: number;
  actions: AgentAction[];
  templates: AgentPromptTemplate[];
  links: AgentLink[];
  apiBindings: AgentApiBindings;
  widgetPlan: AgentWidgetPlan;
  stagedFiles: File[];
  permissions: AgentPermissionGrantInput[];
};

function permissionsFromMatrix(rows: AgentPermission[]): AgentPermissionGrantInput[] {
  return rows
    .filter((p) => Boolean(p.user_id))
    .map((p) => ({
      user_id: p.user_id,
      can_invoke: p.can_invoke,
      can_configure: p.can_configure,
    }));
}

export function agentToEditorDraft(
  agent: Agent,
  permissionRows: AgentPermission[] = []
): AgentEditorDraft {
  return {
    name: agent.name,
    description: agent.description ?? "",
    department: agent.department ?? "ops",
    kind: canonicalAgentKind(agent.kind),
    capabilities: agent.capabilities ?? KIND_PRESETS.chat,
    filePolicy: agent.file_policy ?? DEFAULT_FILE_POLICY,
    linkPolicy: agent.agent_link_policy ?? {
      max_depth: 3,
      default_requires_user_permission: true,
    },
    systemPrompt: agent.system_prompt ?? "",
    modelName: agent.model_name ?? "auto",
    temperature: Number(agent.temperature ?? 0.2),
    actions: [...(agent.actions ?? [])],
    templates: [...(agent.templates ?? [])],
    links: [...(agent.links ?? [])],
    apiBindings: parseApiBindings(agent.config_json),
    widgetPlan: parseWidgetPlan(agent.config_json, agent.department, agent.description),
    stagedFiles: [],
    permissions: permissionsFromMatrix(permissionRows),
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function agentEditorGuideStale(agent: Agent, draft: AgentEditorDraft): boolean {
  const toolNamesFromActions = draft.actions.flatMap((a) => a.tool_chain ?? []);
  const prevWidget = parseWidgetPlan(agent.config_json, agent.department, agent.description);
  return (
    draft.name.trim() !== agent.name ||
    draft.description.trim() !== (agent.description ?? "").trim() ||
    draft.department !== (agent.department ?? "ops") ||
    draft.kind !== canonicalAgentKind(agent.kind) ||
    stableJson(draft.capabilities) !== stableJson(agent.capabilities ?? {}) ||
    stableJson(draft.filePolicy) !== stableJson(agent.file_policy ?? {}) ||
    draft.systemPrompt.trim() !== (agent.system_prompt ?? "").trim() ||
    stableJson(toolNamesFromActions) !== stableJson(agent.tool_names ?? []) ||
    stableJson(draft.actions) !== stableJson(agent.actions ?? []) ||
    stableJson(draft.templates) !== stableJson(agent.templates ?? []) ||
    stableJson(draft.widgetPlan) !== stableJson(prevWidget)
  );
}

export function agentEditorRelationsChanged(agent: Agent, draft: AgentEditorDraft): boolean {
  return (
    stableJson(draft.actions) !== stableJson(agent.actions ?? []) ||
    stableJson(draft.templates) !== stableJson(agent.templates ?? []) ||
    stableJson(draft.links) !== stableJson(agent.links ?? [])
  );
}
