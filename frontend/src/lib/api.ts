import axios, { type AxiosError } from "axios";
import { parseApiError } from "@/lib/errors";
import { handleApiError } from "@/lib/api-error-handler";
import { stripGatewayRouteTags } from "@/lib/sanitize-chat-message";
import {
  canonicalAgentKind,
  DEFAULT_FILE_POLICY,
  DEFAULT_IO_POLICY,
  KIND_PRESETS,
} from "@/lib/agent-presets";
import { normalizeAgentDashboard } from "@/lib/normalize-agent-dashboard";
import type {
  Agent,
  AgentAction,
  AgentCreatePayload,
  AgentFile,
  AgentLink,
  AgentLinkGraph,
  AgentLinkType,
  AgentPermission,
  AgentPermissionGrantInput,
  AgentPromptTemplate,
  AgentRouteResponse,
  BudgetSummary,
  Conversation,
  ConversationDetail,
  ConversationMessage,
  ExternalApiService,
  InvokeResponse,
  KnowledgeDataset,
  Notification,
  Overview,
  Page,
  PlatformEvent,
  SidebarCounts,
  TokenPair,
  ToolInfo,
  TopAgent,
  User,
  ActivityLog,
  AgentDashboard,
  AgentExecution,
  AgentExecutionGuideStatus,
  DepartmentCount,
  UsagePoint,
  HealthItem,
  PlatformHrSavings,
  Role,
} from "@/types";
import { getApiV1Url } from "@/lib/api-base";
import {
  clearSessionTokens,
  fetchWithAuth,
  getValidAccessToken,
  refreshAccessToken,
  storeTokenPair,
} from "@/lib/auth-token";
import { useAuthStore } from "@/stores/auth-store";
import { parseSupportUiAction, type SupportUiAction } from "@/lib/page-guide-context";
import { parseSupportUiScript, type SupportUiScript } from "@/lib/support-ui-script";

const DEFAULT_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS) || 30_000;
const LONG_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_LONG_TIMEOUT_MS) || 600_000;

export const api = axios.create({
  withCredentials: false,
  timeout: DEFAULT_TIMEOUT_MS,
});

/** Agent invoke / actions — can run for several minutes */
const apiLong = axios.create({
  withCredentials: false,
  timeout: LONG_TIMEOUT_MS,
});

if (typeof window !== "undefined") {
  const attachAuth = (client: typeof api) => {
    client.interceptors.request.use(async (config) => {
      config.baseURL = config.baseURL ?? getApiV1Url();
      const token = await getValidAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      const reqId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 12)
          : `${Date.now().toString(36)}`;
      config.headers["x-request-id"] = reqId;
      return config;
    });
    return client;
  };

  const attachResponse = (client: typeof api) => {
    client.interceptors.response.use(
      (res) => res,
      async (error: AxiosError) => {
        const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
        if (error.response?.status === 401 && original && !original._retry) {
          original._retry = true;
          const access = await refreshAccessToken();
          if (access) {
            original.headers = original.headers ?? {};
            original.headers.Authorization = `Bearer ${access}`;
            return client(original);
          }
          logout();
        }

        const apiErr = parseApiError(error);
        const isNetwork = apiErr.status === 0 || error.code === "ERR_NETWORK";
        handleApiError(apiErr, {
          event: "api.response",
          log: !isNetwork && (apiErr.status >= 500 || apiErr.code === "LLM_UNAVAILABLE"),
          toast: false,
        });
        return Promise.reject(apiErr);
      }
    );
    return client;
  };

  attachAuth(api);
  attachAuth(apiLong);
  attachResponse(api);
  attachResponse(apiLong);
}

/** Re-throw normalized ApiError from axios calls. */
export function throwApiError(error: unknown): never {
  throw parseApiError(error);
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>("/auth/login", { email, password });
  storeTokenPair(data);
  return data;
}

export function logout() {
  clearSessionTokens();
  useAuthStore.getState().clear();
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

export async function fetchOverview(): Promise<Overview> {
  const { data } = await api.get<Overview>("/dashboards/overview");
  return data;
}

export async function fetchAgents(params?: {
  department?: string;
  search?: string;
  page_size?: number;
  /** Default false — include user-created agents, not just seeded catalog slugs */
  catalog_only?: boolean;
  status?: string;
}): Promise<Page<Agent>> {
  const { catalog_only = false, ...rest } = params ?? {};
  const { data } = await api.get<Page<Agent>>("/agents", {
    params: { page_size: 50, catalog_only, ...rest },
  });
  return data;
}

/** All agents including test runs — admin / wizard linking only */
export async function fetchAllAgents(params?: {
  department?: string;
  page_size?: number;
  status?: string;
}): Promise<Page<Agent>> {
  return fetchAgents({ ...params, catalog_only: false });
}

export async function checkAgentNameAvailable(name: string): Promise<{
  slug: string;
  available: boolean;
  reason?: string | null;
}> {
  const { data } = await api.get<{ slug: string; available: boolean; reason?: string | null }>(
    "/agents/check-availability",
    { params: { name } }
  );
  return data;
}

function normalizeAgent(raw: Agent): Agent {
  return {
    ...raw,
    kind: canonicalAgentKind(raw.kind),
    capabilities: raw.capabilities ?? KIND_PRESETS.chat,
    file_policy: raw.file_policy ?? DEFAULT_IO_POLICY,
    agent_link_policy: raw.agent_link_policy ?? {
      max_depth: 3,
      default_requires_user_permission: true,
    },
    actions: raw.actions ?? [],
    templates: raw.templates ?? [],
    links: raw.links ?? [],
  };
}

export async function fetchAgentBySlug(slug: string): Promise<Agent> {
  const { data } = await api.get<Agent>(`/agents/by-slug/${slug}`);
  return normalizeAgent(data);
}

export async function fetchAgent(agentId: string): Promise<Agent> {
  const { data } = await api.get<Agent>(`/agents/${agentId}`);
  return normalizeAgent(data);
}

export async function fetchTopAgents(limit = 10): Promise<TopAgent[]> {
  const { data } = await api.get<TopAgent[]>("/dashboards/top-agents", { params: { limit } });
  return data;
}

export async function fetchDepartments(): Promise<DepartmentCount[]> {
  const { data } = await api.get<DepartmentCount[]>("/dashboards/departments");
  return data;
}

export async function fetchSidebarCounts(): Promise<SidebarCounts> {
  const { data } = await api.get<SidebarCounts>("/dashboards/sidebar");
  return data;
}

export async function fetchUsage(days = 30): Promise<UsagePoint[]> {
  const { data } = await api.get<UsagePoint[]>("/dashboards/usage", { params: { days } });
  return data;
}

export async function fetchPlatformHrSavings(): Promise<PlatformHrSavings> {
  const { data } = await api.get<PlatformHrSavings>("/dashboards/hr-savings");
  return data;
}

export async function fetchHealth(): Promise<HealthItem[]> {
  const { data } = await api.get<HealthItem[]>("/dashboards/health");
  return data;
}

export async function fetchEvents(): Promise<PlatformEvent[]> {
  const { data } = await api.get<PlatformEvent[]>("/dashboards/events");
  return data;
}

// ─── LLM provider (admin: old gateway vs cursor-to-api) ──────────────
export type LlmProviderId = "gateway" | "cursor";

export type LlmProvider = {
  active: LlmProviderId;
  cursor: { base_url: string; api_key: string; model: string };
};

export type LlmProviderHealth = {
  active: LlmProviderId;
  gateway: { configured: boolean; base_url: string; model: string };
  cursor: {
    base_url: string;
    model: string;
    reachable: boolean;
    detail: string | null;
  };
};

export type LlmProviderUpdate = {
  active: LlmProviderId;
  cursor_base_url?: string;
  cursor_api_key?: string;
  cursor_model?: string;
};

export async function fetchLlmProvider(): Promise<LlmProvider> {
  const { data } = await api.get<LlmProvider>("/platform/llm-provider");
  return data;
}

export async function fetchLlmProviderHealth(): Promise<LlmProviderHealth> {
  const { data } = await api.get<LlmProviderHealth>(
    "/platform/llm-provider/health"
  );
  return data;
}

export async function updateLlmProvider(
  payload: LlmProviderUpdate
): Promise<LlmProvider> {
  const { data } = await api.put<LlmProvider>("/platform/llm-provider", payload);
  return data;
}

// ── support autonomy (Phase 1 M3) ──────────────────────────────

export async function fetchUserPreferences(): Promise<User> {
  const { data } = await api.get<User>("/users/me/preferences");
  return data;
}

export async function updateUserPreferences(payload: {
  support_autonomy_level?: number;
}): Promise<User> {
  const { data } = await api.put<User>("/users/me/preferences", payload);
  return data;
}

export async function fetchAutonomyDefault(): Promise<{ level: number }> {
  const { data } = await api.get<{ level: number }>("/platform/autonomy-default");
  return data;
}

export type FeatureFlags = {
  run_state_v1: boolean;
  precision_routing_v1: boolean;
  graduated_autonomy_v1: boolean;
};

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  const { data } = await api.get<FeatureFlags>("/platform/feature-flags");
  return data;
}

export async function fetchAvailableModels(): Promise<{
  models: string[];
  default: string;
}> {
  const { data } = await api.get<{ models: string[]; default: string }>(
    "/platform/models"
  );
  return data;
}

export type AgentPreviewInvokePayload = {
  name: string;
  description?: string;
  department?: string;
  kind: string;
  system_prompt: string;
  model_name?: string;
  temperature?: number;
  capabilities?: Record<string, boolean>;
  file_policy?: Record<string, unknown>;
  tool_names?: string[];
  knowledge_bindings?: { dataset_ids: string[] };
  api_bindings?: { service_ids: string[]; endpoint_ids: string[] };
  config_json?: Record<string, unknown>;
  input: string;
  inline_file_context?: string;
};

export async function previewInvokeAgent(
  payload: AgentPreviewInvokePayload
): Promise<InvokeResponse> {
  const { data } = await apiLong.post<InvokeResponse>(
    "/agents/preview-invoke",
    payload
  );
  return data;
}

export async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>("/users");
  return data;
}

export type CreateUserPayload = {
  email: string;
  full_name: string;
  password?: string;
  department?: string;
  role_name?: string;
  is_superuser?: boolean;
  locale?: string;
  title?: string;
  phone?: string;
  address?: string;
};

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await api.post<User>("/users", payload);
  return data;
}

export type CreateRolePayload = {
  name: string;
  description?: string;
};

export async function createRole(payload: CreateRolePayload): Promise<Role> {
  const { data } = await api.post<Role>("/roles", payload);
  return data;
}

export async function fetchRoles(): Promise<Role[]> {
  const { data } = await api.get<Role[]>("/roles");
  return data;
}

export async function fetchTools(): Promise<ToolInfo[]> {
  const { data } = await api.get<ToolInfo[]>("/agents/tools");
  return data;
}

export async function fetchAgentActivity(agentId: string): Promise<ActivityLog[]> {
  const { data } = await api.get<ActivityLog[]>(`/agents/${agentId}/activity`);
  return data;
}

export async function fetchAgentDashboard(
  agentId: string,
  draft = false
): Promise<AgentDashboard> {
  const { data } = await api.get<Record<string, unknown>>(`/agents/${agentId}/dashboard`, {
    params: draft ? { draft: true } : undefined,
  });
  const normalized = normalizeAgentDashboard(data);
  return normalized;
}

export async function approveAgentDashboard(
  agentId: string,
  options?: { scheduleValidation?: boolean }
): Promise<{
  agent_id: string;
  approved: boolean;
  validation_scheduled: boolean;
}> {
  const { data } = await apiLong.post<{
    agent_id: string;
    approved: boolean;
    validation_scheduled: boolean;
  }>(`/agents/${agentId}/dashboard/approve`, null, {
    params:
      options?.scheduleValidation === false ? { schedule_validation: false } : undefined,
  });
  return data;
}

export type DashboardWidgetKind =
  | "stat_cards"
  | "line_chart"
  | "pie_chart"
  | "review_table"
  | "hr_savings";

export type DashboardGenerateResult = {
  agent_id: string;
  has_draft: boolean;
  preview_summary: string;
  widgets_added: string[];
  widgets_modified: string[];
  draft: Record<string, unknown>;
};

export async function generateAgentDashboard(
  agentId: string,
  payload: {
    prompt?: string;
    context_notes?: string;
    widget_type?: DashboardWidgetKind;
    merge_with_existing?: boolean;
  },
  options?: { signal?: AbortSignal }
): Promise<DashboardGenerateResult> {
  const { data } = await apiLong.post<DashboardGenerateResult>(
    `/agents/${agentId}/dashboard/generate`,
    payload,
    { signal: options?.signal }
  );
  return data;
}

export async function rejectAgentDashboardDraft(agentId: string): Promise<{
  agent_id: string;
  has_draft: boolean;
  approved: boolean;
}> {
  const { data } = await api.post<{
    agent_id: string;
    has_draft: boolean;
    approved: boolean;
  }>(`/agents/${agentId}/dashboard/draft/reject`);
  return data;
}

export async function patchAgentDashboardWidgets(
  agentId: string,
  payload: {
    disabled_widgets?: DashboardWidgetKind[];
    remove_widgets?: DashboardWidgetKind[];
    enable_widgets?: DashboardWidgetKind[];
    remove_stat_card_ids?: string[];
  }
): Promise<Agent> {
  const { data } = await api.patch<Agent>(`/agents/${agentId}/dashboard/widgets`, payload);
  return normalizeAgent(data);
}

export async function fetchAgentExecution(agentId: string): Promise<AgentExecution> {
  const { data } = await api.get<AgentExecution>(`/agents/${agentId}/execution`);
  return data;
}

export async function fetchAgentExecutionGuideStatus(
  agentId: string
): Promise<AgentExecutionGuideStatus> {
  const { data } = await api.get<AgentExecutionGuideStatus>(
    `/agents/${agentId}/execution/status`
  );
  return data;
}

export async function regenerateExecutionGuide(
  agentId: string,
  opts?: { wait?: boolean }
): Promise<{ agent_id: string; scheduled: boolean; completed?: boolean }> {
  const client = opts?.wait ? apiLong : api;
  const { data } = await client.post<{ agent_id: string; scheduled: boolean; completed?: boolean }>(
    `/agents/${agentId}/execution/regenerate`,
    null,
    { params: opts?.wait ? { wait: true } : undefined }
  );
  return data;
}

type AgentActionPayload = {
  slug: string;
  label: string;
  description?: string;
  icon?: string;
  input_schema: Record<string, unknown>;
  prompt_template: string;
  tool_chain: string[];
  confirmation_required: boolean;
  order_index: number;
};

type AgentTemplatePayload = {
  slug: string;
  label: string;
  body: string;
  variables: Record<string, unknown>;
  order_index: number;
};

export async function createAgentAction(
  agentId: string,
  payload: AgentActionPayload
): Promise<AgentAction> {
  const { data } = await api.post<AgentAction>(`/agents/${agentId}/actions`, payload);
  return data;
}

export async function updateAgentAction(
  agentId: string,
  actionId: string,
  payload: Partial<AgentActionPayload>
): Promise<AgentAction> {
  const { data } = await api.patch<AgentAction>(
    `/agents/${agentId}/actions/${actionId}`,
    payload
  );
  return data;
}

export async function deleteAgentAction(agentId: string, actionId: string): Promise<void> {
  await api.delete(`/agents/${agentId}/actions/${actionId}`);
}

export async function createAgentTemplate(
  agentId: string,
  payload: AgentTemplatePayload
): Promise<AgentPromptTemplate> {
  const { data } = await api.post<AgentPromptTemplate>(
    `/agents/${agentId}/templates`,
    payload
  );
  return data;
}

export async function updateAgentTemplate(
  agentId: string,
  templateId: string,
  payload: Partial<AgentTemplatePayload>
): Promise<AgentPromptTemplate> {
  const { data } = await api.patch<AgentPromptTemplate>(
    `/agents/${agentId}/templates/${templateId}`,
    payload
  );
  return data;
}

export async function deleteAgentTemplate(agentId: string, templateId: string): Promise<void> {
  await api.delete(`/agents/${agentId}/templates/${templateId}`);
}

export async function createAgentLink(
  agentId: string,
  payload: {
    callee_agent_id: string;
    link_type: AgentLinkType;
    requires_user_permission: boolean;
    description?: string;
  }
): Promise<AgentLink> {
  const { data } = await api.post<AgentLink>(`/agents/${agentId}/links`, payload);
  return data;
}

export async function deleteAgentLink(agentId: string, linkId: string): Promise<void> {
  await api.delete(`/agents/${agentId}/links/${linkId}`);
}

export async function routeAgent(prompt: string): Promise<AgentRouteResponse> {
  const { data } = await api.post<AgentRouteResponse>("/agents/route", { prompt });
  return data;
}

export type PromptSuggestPayload = {
  name: string;
  description?: string;
  department?: string;
  kind: string;
  tool_names?: string[];
  capabilities?: Record<string, boolean>;
  existing_prompt?: string;
  instruction_files?: string[];
};

export async function suggestSystemPrompt(payload: PromptSuggestPayload): Promise<string> {
  const { data } = await api.post<{ suggested_prompt: string }>("/prompts/suggest", payload);
  return data.suggested_prompt;
}

export async function fetchBudgetSummary(): Promise<BudgetSummary> {
  const { data } = await api.get<BudgetSummary>("/budgets/summary");
  return data;
}

export async function fetchAgentPermissions(): Promise<AgentPermission[]> {
  const { data } = await api.get<AgentPermission[]>("/agent-permissions");
  return data;
}

export async function replaceAgentPermissions(
  agentId: string,
  permissions: AgentPermissionGrantInput[]
): Promise<void> {
  await api.put(`/agents/${agentId}/permissions`, { permissions });
}

export async function createAgent(payload: Partial<Agent>): Promise<Agent> {
  const { data } = await api.post<Agent>("/agents", payload);
  return data;
}

export async function updateAgent(
  id: string,
  payload: Partial<Agent> & Pick<AgentCreatePayload, "api_bindings" | "knowledge_bindings">
): Promise<Agent> {
  const { data } = await api.patch<Agent>(`/agents/${id}`, payload);
  return normalizeAgent(data);
}

export async function refreshAgentInstructions(
  agentId: string,
  payload: { instruction_text?: string; force?: boolean }
): Promise<Agent> {
  const { data } = await apiLong.post<Agent>(`/agents/${agentId}/instructions/refresh`, payload);
  return normalizeAgent(data);
}

export async function pauseDeployingAgent(id: string): Promise<Agent> {
  const { data } = await api.post<Agent>(`/agents/${id}/pause-deploy`);
  return normalizeAgent(data);
}

export async function submitValidationAnswers(
  agentId: string,
  answers: Record<string, string>
): Promise<{ agent_id: string; status: string; scheduled: boolean }> {
  const { data } = await api.post<{ agent_id: string; status: string; scheduled: boolean }>(
    `/agents/${agentId}/validation/answers`,
    { answers }
  );
  return data;
}

export async function deleteAgent(id: string): Promise<void> {
  await api.delete(`/agents/${id}`);
}

export async function invokeAgent(
  agentId: string,
  input: string,
  threadId?: string
): Promise<InvokeResponse> {
  const { data } = await apiLong.post<InvokeResponse>(`/agents/${agentId}/invoke`, {
    input,
    thread_id: threadId,
    stream: false,
  });
  return data;
}

export type InvokeStreamCallbacks = {
  onThinkingStart?: () => void;
  onThinkingToken?: (token: string) => void;
  onThinkingEnd?: (summary?: string) => void;
  onStatus?: (message: string) => void;
  onPhase?: (phase: string, message: string) => void;
  onGeneratingStart?: () => void;
  onToken?: () => void;
};

export async function invokeAgentStream(
  agentId: string,
  input: string,
  onToken: (token: string) => void,
  threadId?: string,
  onFinalOutput?: (output: string) => void,
  callbacks?: InvokeStreamCallbacks
): Promise<{ uiActions: SupportUiAction[]; uiScript?: SupportUiScript; output?: string }> {
  const res = await fetchWithAuth(`${getApiV1Url()}/agents/${agentId}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, thread_id: threadId, stream: true }),
  });
  if (!res.ok) {
    if (res.status === 401) logout();
    let data: unknown = {};
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    throw parseApiError({
      isAxiosError: true,
      message: res.statusText,
      response: { status: res.status, data },
    });
  }
  const reader = res.body?.getReader();
  if (!reader) {
    throw parseApiError(new Error("پاسخ استریم از سرور دریافت نشد."));
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const uiActions: SupportUiAction[] = [];
  let uiScript: SupportUiScript | undefined;
  let finalOutput: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let json: {
        token?: string;
        output?: string;
        error?: string;
        done?: boolean;
        ui_action?: unknown;
        ui_actions?: unknown[];
        ui_script?: unknown;
        ui_scripts?: unknown[];
        thinking_start?: boolean;
        thinking_token?: string;
        thinking_end?: boolean;
        thinking_summary?: string;
        status?: string;
        phase?: string;
        message?: string;
      };
      try {
        json = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (json.thinking_start) callbacks?.onThinkingStart?.();
      if (json.thinking_token) callbacks?.onThinkingToken?.(json.thinking_token);
      if (json.thinking_end) {
        callbacks?.onThinkingEnd?.(
          typeof json.thinking_summary === "string" ? json.thinking_summary : undefined
        );
      }
      if (json.status === "phase" && json.phase && json.message) {
        callbacks?.onPhase?.(String(json.phase), String(json.message));
      }
      if (json.status === "tool" && json.message) {
        callbacks?.onStatus?.(String(json.message));
      }
      if (json.status === "generating") {
        callbacks?.onGeneratingStart?.();
      }
      if (json.token) {
        const token = stripGatewayRouteTags(String(json.token), false);
        if (!token) continue;
        callbacks?.onToken?.();
        onToken(token);
      }
      if (json.error) {
        throw parseApiError({
          isAxiosError: true,
          response: {
            status: 500,
            data: { message: String(json.error), code: "INTERNAL_ERROR" },
          },
        });
      }
      if (json.done) {
        if (typeof json.output === "string" && json.output.trim()) {
          finalOutput = stripGatewayRouteTags(json.output);
          onFinalOutput?.(finalOutput);
        }
        const fromList = Array.isArray(json.ui_actions)
          ? json.ui_actions.map(parseSupportUiAction).filter(Boolean)
          : [];
        for (const action of fromList) {
          if (action) uiActions.push(action);
        }
        const single = parseSupportUiAction(json.ui_action);
        if (single && !uiActions.some((a) => JSON.stringify(a) === JSON.stringify(single))) {
          uiActions.push(single);
        }
        const scripts = Array.isArray(json.ui_scripts)
          ? json.ui_scripts.map(parseSupportUiScript).filter(Boolean)
          : [];
        uiScript =
          parseSupportUiScript(json.ui_script) ??
          (scripts.length ? scripts[scripts.length - 1] : undefined);
      }
    }
  }
  return { uiActions, uiScript, output: finalOutput };
}

export async function fetchNotifications(unreadOnly = false): Promise<Notification[]> {
  const { data } = await api.get<Notification[]>("/notifications", {
    params: { unread_only: unreadOnly },
  });
  return data;
}

export async function fetchNotificationCount(): Promise<{ unread: number }> {
  const { data } = await api.get<{ unread: number }>("/notifications/count");
  return data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/notifications/read-all");
}

export async function fetchConversations(): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>("/conversations");
  return data;
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const { data } = await api.get<ConversationDetail>(`/conversations/${id}`);
  return data;
}

export async function fetchSupportThreadMessages(
  agentId: string,
  threadId: string
): Promise<ConversationMessage[]> {
  const { data } = await api.get<ConversationMessage[]>("/conversations/thread/messages", {
    params: { agent_id: agentId, thread_id: threadId },
  });
  return data;
}

export type SupportThread = {
  thread_id: string;
  preview: string;
  started_at?: string | null;
  updated_at?: string | null;
  message_count: number;
};

export async function fetchSupportThreads(agentId: string): Promise<SupportThread[]> {
  const { data } = await api.get<SupportThread[]>("/conversations/support-threads", {
    params: { agent_id: agentId },
  });
  return data;
}

export async function fetchExternalApis(): Promise<ExternalApiService[]> {
  const { data } = await api.get<ExternalApiService[]>("/external-apis");
  return data;
}

export async function createExternalApiService(
  payload: Partial<ExternalApiService>
): Promise<ExternalApiService> {
  const { data } = await api.post<ExternalApiService>("/external-apis", payload);
  return data;
}

export async function createExternalApiEndpoint(
  serviceId: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const { data } = await api.post(`/external-apis/${serviceId}/endpoints`, payload);
  return data;
}

export async function testExternalApiEndpoint(
  _endpointId: string,
  _params: Record<string, unknown> = {},
  _body: Record<string, unknown> = {}
): Promise<never> {
  // ponytail: backend "test connection" endpoint removed; this stub lives only
  // to keep the typed import surface stable. Callers that used this should be
  // deleted in a separate frontend cleanup pass.
  throw new Error("testExternalApiEndpoint has been removed from the backend");
}

export async function ingestKnowledge(
  content: string,
  agentId?: string
): Promise<{ id: string; ids?: string[]; chunk_count?: number }> {
  const { data } = await api.post<{ id: string; ids?: string[]; chunk_count?: number }>(
    "/knowledge/ingest",
    {
    content,
    agent_id: agentId,
    }
  );
  return data;
}

export type KnowledgeChunk = {
  id: string;
  agent_id?: string | null;
  dataset_id?: string | null;
  content: string;
  content_preview: string;
  source: string;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function fetchKnowledgeDatasets(params?: {
  q?: string;
  source_type?: string;
  page?: number;
}): Promise<KnowledgeDataset[]> {
  const { data } = await api.get<KnowledgeDataset[]>("/knowledge/datasets", {
    params: {
      q: params?.q,
      source_type: params?.source_type,
      page: params?.page,
    },
  });
  return data;
}

export async function uploadKnowledgeDatasetFile(
  datasetId: string,
  file: File
): Promise<{ dataset_id: string; chunk_count: number }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ dataset_id: string; chunk_count: number }>(
    `/knowledge/datasets/${datasetId}/upload`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function createKnowledgeDataset(
  payload: Partial<KnowledgeDataset> & { name: string }
): Promise<KnowledgeDataset> {
  const { data } = await api.post<KnowledgeDataset>("/knowledge/datasets", payload);
  return data;
}

export async function ingestKnowledgeDataset(
  datasetId: string,
  content: string,
  source?: string
): Promise<{ dataset_id: string; chunk_count: number; content_hash: string }> {
  const { data } = await api.post<{ dataset_id: string; chunk_count: number; content_hash: string }>(
    `/knowledge/datasets/${datasetId}/ingest`,
    { content, source }
  );
  return data;
}

export async function fetchKnowledge(params?: {
  agentId?: string;
  datasetId?: string;
  limit?: number;
}): Promise<KnowledgeChunk[]> {
  const { data } = await api.get<KnowledgeChunk[]>("/knowledge", {
    params: {
      agent_id: params?.agentId,
      dataset_id: params?.datasetId,
      limit: params?.limit ?? 500,
    },
  });
  return data;
}

export async function reindexAgentKnowledge(
  agentId: string
): Promise<{ agent_id: string; indexed_chunks: number }> {
  const { data } = await api.post<{ agent_id: string; indexed_chunks: number }>(
    `/knowledge/reindex-agent/${agentId}`
  );
  return data;
}

export async function searchKnowledge(
  q: string,
  agentId?: string
): Promise<{ id: string; content: string; score: number }[]> {
  const { data } = await api.get("/knowledge/search", { params: { q, agent_id: agentId } });
  return data;
}

export async function createAgentWithPermissions(payload: AgentCreatePayload): Promise<Agent> {
  const { data } = await api.post<Agent>("/agents", payload);
  return normalizeAgent(data);
}

export async function startAgentValidation(agentId: string): Promise<{
  agent_id: string;
  status: string;
  scheduled: boolean;
}> {
  const { data } = await api.post<{ agent_id: string; status: string; scheduled: boolean }>(
    `/agents/${agentId}/validate`
  );
  return data;
}

/** Run planning Q&A before interactive training. */
export async function planAgentPreflight(agentId: string): Promise<Agent> {
  const { data } = await apiLong.post<Agent>(`/agents/${agentId}/planning/preflight`);
  return normalizeAgent(data);
}

export async function prepareAgentRuntime(agentId: string): Promise<Agent> {
  const { data } = await apiLong.post<Agent>(`/agents/${agentId}/runtime/prepare`);
  return normalizeAgent(data);
}

export async function startAgentTraining(agentId: string): Promise<Agent> {
  const { data } = await api.post<Agent>(`/agents/${agentId}/training/start`);
  return normalizeAgent(data);
}

export async function completeAgentTraining(
  agentId: string,
  payload: {
    messages: { role: "user" | "assistant"; content: string }[];
    notes?: string;
  }
): Promise<{ agent_id: string; training_saved: boolean; validation_scheduled: boolean }> {
  const { data } = await apiLong.post<{
    agent_id: string;
    training_saved: boolean;
    validation_scheduled: boolean;
  }>(`/agents/${agentId}/training/complete`, payload);
  return data;
}

export async function fetchAgentActions(agentId: string): Promise<AgentAction[]> {
  const { data } = await api.get<AgentAction[]>(`/agents/${agentId}/actions`);
  return data;
}

export async function fetchAgentTemplates(agentId: string): Promise<AgentPromptTemplate[]> {
  const { data } = await api.get<AgentPromptTemplate[]>(`/agents/${agentId}/templates`);
  return data;
}

export async function fetchAgentLinks(agentId: string): Promise<AgentLink[]> {
  const { data } = await api.get<AgentLink[]>(`/agents/${agentId}/links`);
  return data;
}

export async function fetchAgentLinkGraph(agentId: string): Promise<AgentLinkGraph> {
  const { data } = await api.get<AgentLinkGraph>(`/agents/${agentId}/links/graph`);
  return data;
}

export async function fetchAgentFiles(agentId: string): Promise<AgentFile[]> {
  const { data } = await api.get<AgentFile[]>(`/agents/${agentId}/files`);
  return data;
}

export async function uploadAgentFile(agentId: string, file: File): Promise<AgentFile> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<AgentFile>(`/agents/${agentId}/files`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteAgentFile(agentId: string, fileId: string): Promise<void> {
  await api.delete(`/agents/${agentId}/files/${fileId}`);
}

export async function runAgentAction(
  agentId: string,
  slug: string,
  variables: Record<string, unknown> = {},
  threadId?: string
): Promise<InvokeResponse> {
  const { data } = await apiLong.post<InvokeResponse>(
    `/agents/${agentId}/actions/${slug}/run`,
    { variables, thread_id: threadId }
  );
  return data;
}
