import { prepareActionsForPublish, deriveAgentToolNames } from "@/lib/action-inputs";
import { clampCapabilitiesForKind } from "@/lib/capability-rules";
import { resolvePublishFileConfig } from "@/lib/agent-presets";
import { validateFilePolicy } from "@/components/agents/file-policy-form";
import type { AgentEditorDraft } from "@/lib/agent-editor-state";
import {
  agentEditorGuideStale,
  agentEditorRelationsChanged,
} from "@/lib/agent-editor-state";
import { isInstructionFileName } from "@/lib/agent-file-roles";
import { widgetPlanToConfigJson } from "@/lib/widget-plan";
import {
  createAgentAction,
  createAgentLink,
  createAgentTemplate,
  deleteAgentAction,
  deleteAgentLink,
  deleteAgentTemplate,
  regenerateExecutionGuide,
  refreshAgentInstructions,
  replaceAgentPermissions,
  updateAgent,
  updateAgentAction,
  updateAgentTemplate,
  uploadAgentFile,
} from "@/lib/api";
import type { Agent, AgentAction, AgentLink, AgentPromptTemplate } from "@/types";
import type { AgentPermissionGrantInput } from "@/types";

function permissionsSnapshot(perms: AgentPermissionGrantInput[]): string {
  return JSON.stringify(
    [...perms]
      .filter((p) => Boolean(p.user_id))
      .sort((a, b) => a.user_id.localeCompare(b.user_id))
      .map((p) => ({
        user_id: p.user_id,
        can_invoke: p.can_invoke,
        can_configure: p.can_configure,
      }))
  );
}

export function agentEditorPermissionsChanged(
  before: AgentPermissionGrantInput[],
  after: AgentPermissionGrantInput[]
): boolean {
  return permissionsSnapshot(before) !== permissionsSnapshot(after);
}

export type PersistAgentEditorOptions = {
  /** When false, skip PUT /permissions (e.g. non-superuser). Default true. */
  syncPermissions?: boolean;
  initialPermissions?: AgentPermissionGrantInput[];
};

function actionPayload(action: AgentAction, orderIndex: number) {
  return {
    slug: action.slug,
    label: action.label,
    description: action.description,
    icon: action.icon,
    input_schema: action.input_schema,
    prompt_template: action.prompt_template,
    tool_chain: action.tool_chain,
    confirmation_required: action.confirmation_required,
    order_index: orderIndex,
  };
}

function templatePayload(template: AgentPromptTemplate, orderIndex: number) {
  return {
    slug: template.slug,
    label: template.label,
    body: template.body,
    variables: template.variables,
    order_index: orderIndex,
  };
}

function linkKey(link: AgentLink) {
  return `${link.link_type}:${link.callee_agent_id}`;
}

async function syncActions(agentId: string, before: AgentAction[], after: AgentAction[]) {
  const beforeById = new Map(before.filter((a) => a.id).map((a) => [a.id!, a]));
  const afterIds = new Set(after.filter((a) => a.id).map((a) => a.id!));

  for (const prev of before) {
    if (prev.id && !afterIds.has(prev.id)) {
      await deleteAgentAction(agentId, prev.id);
    }
  }

  for (let i = 0; i < after.length; i += 1) {
    const act = after[i];
    const payload = actionPayload(act, i);
    if (act.id && beforeById.has(act.id)) {
      await updateAgentAction(agentId, act.id, payload);
    } else {
      await createAgentAction(agentId, payload);
    }
  }
}

async function syncTemplates(
  agentId: string,
  before: AgentPromptTemplate[],
  after: AgentPromptTemplate[]
) {
  const beforeById = new Map(before.filter((t) => t.id).map((t) => [t.id!, t]));
  const afterIds = new Set(after.filter((t) => t.id).map((t) => t.id!));

  for (const prev of before) {
    if (prev.id && !afterIds.has(prev.id)) {
      await deleteAgentTemplate(agentId, prev.id);
    }
  }

  for (let i = 0; i < after.length; i += 1) {
    const tpl = after[i];
    const payload = templatePayload(tpl, i);
    if (tpl.id && beforeById.has(tpl.id)) {
      await updateAgentTemplate(agentId, tpl.id, payload);
    } else {
      await createAgentTemplate(agentId, payload);
    }
  }
}

async function syncLinks(agentId: string, before: AgentLink[], after: AgentLink[]) {
  const beforeKeys = new Map(before.map((l) => [linkKey(l), l]));
  const afterKeys = new Set(after.map(linkKey));

  for (const prev of before) {
    if (!afterKeys.has(linkKey(prev)) && prev.id) {
      await deleteAgentLink(agentId, prev.id);
    }
  }

  for (const link of after) {
    if (!beforeKeys.has(linkKey(link))) {
      await createAgentLink(agentId, {
        callee_agent_id: link.callee_agent_id,
        link_type: link.link_type,
        requires_user_permission: link.requires_user_permission,
        description: link.description,
      });
    }
  }
}

export async function persistAgentEditor(
  agent: Agent,
  draft: AgentEditorDraft,
  opts: PersistAgentEditorOptions = {}
): Promise<Agent> {
  const preparedActions = prepareActionsForPublish(draft.actions);
  const toolNames = deriveAgentToolNames(preparedActions);
  const { capabilities: publishCaps, filePolicy: publishIoPolicy } = resolvePublishFileConfig(
    draft.capabilities,
    draft.filePolicy,
    draft.filePolicy,
    draft.stagedFiles.length,
    toolNames
  );
  const publishFilePolicy = publishIoPolicy.input;
  const caps = clampCapabilitiesForKind(draft.kind, publishCaps);

  const publishFilePolicyError = validateFilePolicy(publishFilePolicy);
  if (publishFilePolicyError) {
    throw new Error(publishFilePolicyError);
  }

  const configJson = {
    ...(agent.config_json ?? {}),
    ...widgetPlanToConfigJson(draft.widgetPlan),
  };

  const updated = await updateAgent(agent.id, {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    department: draft.department,
    kind: draft.kind,
    capabilities: caps,
    file_policy: publishIoPolicy,
    agent_link_policy: draft.linkPolicy,
    system_prompt: draft.systemPrompt.trim() || undefined,
    model_name: draft.modelName,
    temperature: draft.temperature,
    tool_names: caps.actions_enabled ? toolNames : agent.tool_names,
    api_bindings: caps.external_apis_enabled ? draft.apiBindings : { service_ids: [], endpoint_ids: [] },
    config_json: configJson,
  });

  await syncActions(agent.id, agent.actions ?? [], preparedActions);
  await syncTemplates(agent.id, agent.templates ?? [], draft.templates);
  await syncLinks(agent.id, agent.links ?? [], draft.links);

  const shouldSyncPermissions = opts.syncPermissions !== false;
  const permissionsChanged = agentEditorPermissionsChanged(
    opts.initialPermissions ?? [],
    draft.permissions
  );
  if (shouldSyncPermissions && permissionsChanged) {
    const grants = draft.permissions.filter((p) => Boolean(p.user_id));
    if (!grants.length) {
      throw new Error("حداقل یک کاربر برای دسترسی به ایجنت انتخاب کنید.");
    }
    await replaceAgentPermissions(agent.id, grants);
  }

  for (const file of draft.stagedFiles) {
    await uploadAgentFile(agent.id, file);
  }

  const hasInstructionFiles =
    draft.stagedFiles.some((file) => isInstructionFileName(file.name)) ||
    Boolean(draft.systemPrompt.trim());

  const refreshed = await refreshAgentInstructions(agent.id, {
    instruction_text: draft.systemPrompt.trim() || undefined,
    force: hasInstructionFiles,
  });

  if (hasInstructionFiles) {
    await scheduleGuideRegenerationIfNeeded(agent, draft, { force: true });
  }

  return refreshed;
}

export async function scheduleGuideRegenerationIfNeeded(
  agent: Agent,
  draft: AgentEditorDraft,
  opts?: { force?: boolean }
): Promise<void> {
  if (opts?.force) {
    await regenerateExecutionGuide(agent.id, { wait: true });
    return;
  }
  const relationsChanged = agentEditorRelationsChanged(agent, draft);
  const guideFieldsChanged = agentEditorGuideStale(agent, draft);
  if (guideFieldsChanged || relationsChanged) {
    await regenerateExecutionGuide(agent.id, { wait: true });
  }
}
