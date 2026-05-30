export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
};

export type Role = {
  id: string;
  name: string;
  description?: string;
};

export type User = {
  id: string;
  email: string;
  full_name: string;
  locale: string;
  department?: string;
  title?: string;
  avatar_url?: string;
  is_active: boolean;
  is_superuser: boolean;
  mfa_enabled: boolean;
  roles: Role[];
  created_at: string;
  updated_at: string;
};

export type AgentStatus = "draft" | "active" | "paused" | "error" | "deploying" | "archived";

/** Four agent types — file/API/spreadsheet behavior comes from capabilities. */
export type AgentKind = "chat" | "worker" | "supervisor" | "custom";

export type AgentCapabilities = {
  chat_enabled: boolean;
  file_upload_enabled: boolean;
  actions_enabled: boolean;
  templates_enabled: boolean;
  can_call_agents: boolean;
  supervisor_enabled: boolean;
  external_apis_enabled?: boolean;
};

export type AgentApiBindings = {
  service_ids: string[];
  endpoint_ids: string[];
};

export type AgentFilePolicy = {
  min_files: number;
  max_files: number;
  max_file_size_mb: number;
  max_total_size_mb: number;
  allowed_mime_types: string[];
  allowed_extensions: string[];
  require_files_to_invoke: boolean;
  auto_ingest_to_rag: boolean;
};

export type AgentLinkPolicy = {
  max_depth: number;
  default_requires_user_permission: boolean;
};

export type AgentAction = {
  id?: string;
  agent_id?: string;
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

export type AgentPromptTemplate = {
  id?: string;
  agent_id?: string;
  slug: string;
  label: string;
  body: string;
  variables: Record<string, unknown>;
  order_index: number;
};

export type AgentLinkType = "tool" | "supervises";

export type AgentLink = {
  id?: string;
  caller_agent_id?: string;
  callee_agent_id: string;
  link_type: AgentLinkType;
  requires_user_permission: boolean;
  description?: string;
  callee_name?: string;
  callee_slug?: string;
};

export type AgentLinkGraph = {
  nodes: { id: string; slug: string; name: string; kind: string }[];
  edges: { source: string; target: string; link_type: AgentLinkType }[];
};

export type AgentFile = {
  id: string;
  agent_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type Agent = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  department?: string;
  status: AgentStatus;
  kind: AgentKind;
  capabilities: AgentCapabilities;
  file_policy: AgentFilePolicy;
  agent_link_policy: AgentLinkPolicy;
  model_provider: string;
  model_name: string;
  temperature: number;
  system_prompt?: string;
  tool_names: string[];
  config_json?: Record<string, unknown>;
  actions?: AgentAction[];
  templates?: AgentPromptTemplate[];
  links?: AgentLink[];
  created_at: string;
  updated_at: string;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type Overview = {
  agents: { total: number; active: number };
  runs: { total: number; successful: number; this_week: number };
  users: { total: number };
  departments: { total: number };
  success_rate: number;
  total_cost_usd: number;
};

export type TopAgent = {
  id: string;
  name: string;
  slug: string;
  department?: string;
  runs: number;
};

export type AgentDashboardStatCard = {
  label: string;
  value: string;
  hint?: string;
  chartVariant?: string;
};

export type AgentDashboardLineSeries = {
  name: string;
  dataKey: string;
  dashed?: boolean;
};

export type AgentDashboardLineChart = {
  title: string;
  series: AgentDashboardLineSeries[];
  points: Record<string, string | number>[];
};

export type AgentDashboardPieChart = {
  title: string;
  slices: { name: string; value: number }[];
};

export type AgentDashboardReviewColumn = {
  key: string;
  label: string;
};

export type AgentDashboardReviewRow = {
  id: string;
  cells: Record<string, string>;
  status?: string;
};

export type AgentDashboardReviewTable = {
  title: string;
  columns: AgentDashboardReviewColumn[];
  rows: AgentDashboardReviewRow[];
};

export type AgentExecution = {
  profile: string;
  domain_label: string;
  headline: string;
  summary: string;
  responsibilities: string[];
  how_to_steps: string[];
  inputs: string[];
  outputs: string[];
  tips: string[];
  actions: { slug: string; label: string; description?: string }[];
  templates: { slug: string; label: string; body: string }[];
  tools: string[];
};

export type AgentDashboardRunSummary = {
  total_runs: number;
  success_runs: number;
  error_runs: number;
  avg_duration_label: string;
  cost_label: string;
  tokens_total: number;
};

export type AgentDashboardHrSavings = {
  role_title: string;
  period_label: string;
  uses_live_activity: boolean;
  run_count: number;
  tokens_total: number;
  employee_monthly_salary_irr: number;
  employee_hourly_irr: number;
  human_hours: number;
  human_hours_label: string;
  human_cost_irr: number;
  human_cost_label: string;
  agent_hours: number;
  agent_hours_label: string;
  agent_cost_irr: number;
  agent_cost_label: string;
  time_saved_hours: number;
  time_saved_label: string;
  money_saved_irr: number;
  money_saved_label: string;
  savings_percent: number;
  usd_to_irr_rate: number;
};

export type AgentDashboard = {
  profile: string;
  domain_label: string;
  panel_title: string;
  uses_live_runs: boolean;
  stat_cards: AgentDashboardStatCard[];
  line_chart?: AgentDashboardLineChart | null;
  pie_chart?: AgentDashboardPieChart | null;
  review_table?: AgentDashboardReviewTable | null;
  run_summary?: AgentDashboardRunSummary | null;
  hr_savings: AgentDashboardHrSavings;
};

export type ActivityLog = {
  id: string;
  agent_id: string;
  action: string;
  status: string;
  input_text?: string;
  output_text?: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  duration_ms?: number;
  started_at: string;
};

export type PlatformEvent = {
  id: string;
  type: string;
  message: string;
  severity: string;
  created_at: string;
};

export type ToolInfo = {
  slug: string;
  name: string;
  description: string;
};

export type ExecutionTraceStep = {
  step?: number | null;
  kind: string;
  label: string;
  detail?: string | null;
  payload?: Record<string, unknown> | null;
};

export type InvokeResponse = {
  output: string;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  duration_ms: number;
  activity_log_id?: string;
  execution_trace?: ExecutionTraceStep[];
  llm_provider?: string | null;
  model_name?: string | null;
};

export type AgentRouteResponse = {
  agent: {
    id: string;
    name: string;
    slug: string;
    department?: string;
    description?: string;
  } | null;
  confidence: number;
  reason: string;
};

export type BudgetSummary = {
  total_budget_usd: number;
  total_spent_usd: number;
  alerts: { budget_id: string; name: string; utilization_pct: number }[];
};

export type AgentPermission = {
  user_id: string;
  user_name: string;
  agent_id: string;
  agent_name: string;
  can_invoke: boolean;
  can_configure: boolean;
};

export type DepartmentCount = {
  department: string;
  count: number;
};

export type UsagePoint = {
  day: string;
  runs: number;
};

export type HealthItem = {
  name: string;
  status: string;
  latency_ms: number;
  uptime_pct: number;
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  severity: string;
  link?: string;
  is_read: boolean;
  created_at: string;
};

export type Conversation = {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_slug: string;
  preview: string;
  output_preview?: string;
  status: string;
  action?: string;
  started_at: string;
  thread_id?: string | null;
  message_count?: number;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ConversationDetail = {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_slug: string;
  thread_id: string | null;
  status: string;
  action: string;
  started_at: string | null;
  can_continue: boolean;
  messages: ConversationMessage[];
};

export type ExternalApiEndpoint = {
  id: string;
  service_id: string;
  name: string;
  slug: string;
  description?: string;
  path: string;
  method: string;
  register_as_tool: boolean;
  is_active: boolean;
};

export type ExternalApiService = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  base_url: string;
  auth_type: string;
  auth_config: Record<string, string>;
  default_headers: Record<string, string>;
  is_active: boolean;
  endpoints: ExternalApiEndpoint[];
};

export type AgentPermissionGrantInput = {
  user_id: string;
  can_invoke: boolean;
  can_configure: boolean;
};

export type SidebarCounts = {
  my_agents: number;
  conversations: number;
  unread_notifications: number;
  pending_access_requests: number;
  worker_agents: number;
};

export type AgentCreatePayload = Partial<Agent> & {
  permissions?: AgentPermissionGrantInput[];
  actions?: AgentAction[];
  templates?: AgentPromptTemplate[];
  links?: AgentLink[];
  api_bindings?: AgentApiBindings;
};
