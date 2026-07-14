import type { AgentCapabilities, AgentFilePolicy, AgentKind, ExecutionPrecision, IoFilePolicy } from "@/types";

/** Only four agent types — everything else is a capability toggle. */
export const AGENT_KINDS: AgentKind[] = ["chat", "worker", "supervisor", "custom"];

export const KIND_LABELS: Record<AgentKind, string> = {
  chat: "گفت‌وگو",
  worker: "کارگر",
  supervisor: "سرپرست",
  custom: "سفارشی",
};

export const PRECISION_LABELS: Record<ExecutionPrecision, string> = {
  deterministic: "قطعی",
  guided: "هدایت‌شده",
  autonomous: "خودکار",
};

export const PRECISION_HELPERS: Record<ExecutionPrecision, string> = {
  deterministic: "ورودی یکسان → خروجی یکسان؛ بهترین برای قواعد حقوق و اکسل",
  guided: "هوش مصنوعی با محدودیت؛ بازبینی انسانی توصیه می‌شود",
  autonomous: "دسترسی کامل به ابزارها؛ ریسک بالاتر",
};

export const PRECISION_ORDER: ExecutionPrecision[] = [
  "deterministic",
  "guided",
  "autonomous",
];

const _KIND_DEFAULT_PRECISION: Record<AgentKind, ExecutionPrecision> = {
  chat: "autonomous",
  worker: "deterministic",
  supervisor: "guided",
  custom: "guided",
};

/** Mirrors backend `precision_for_kind` in precision_defaults.py. */
export function precisionForKind(kind: AgentKind): ExecutionPrecision {
  return _KIND_DEFAULT_PRECISION[kind] ?? "guided";
}

export function parseExecutionPrecision(
  config?: Record<string, unknown> | null
): ExecutionPrecision | null {
  const raw = config?.execution_precision as string | undefined;
  if (!raw) return null;
  return raw in PRECISION_LABELS ? (raw as ExecutionPrecision) : null;
}

export const KIND_PRESETS: Record<AgentKind, AgentCapabilities> = {
  chat: {
    chat_enabled: true,
    file_upload_enabled: false,
    actions_enabled: false,
    templates_enabled: false,
    can_call_agents: false,
    supervisor_enabled: false,
  },
  worker: {
    chat_enabled: false,
    file_upload_enabled: false,
    actions_enabled: true,
    templates_enabled: false,
    can_call_agents: false,
    supervisor_enabled: false,
  },
  supervisor: {
    chat_enabled: true,
    file_upload_enabled: false,
    actions_enabled: false,
    templates_enabled: false,
    can_call_agents: false,
    supervisor_enabled: true,
  },
  custom: {
    chat_enabled: true,
    file_upload_enabled: false,
    actions_enabled: false,
    templates_enabled: false,
    can_call_agents: false,
    supervisor_enabled: false,
    external_apis_enabled: false,
  },
};

const LEGACY_KIND_MAP: Record<string, AgentKind> = {
  file_intake: "worker",
  api: "chat",
  spreadsheet: "worker",
};

export function canonicalAgentKind(kind: string | undefined): AgentKind {
  if (!kind) return "chat";
  if (kind in KIND_LABELS) return kind as AgentKind;
  return LEGACY_KIND_MAP[kind] ?? "custom";
}

export const FILE_POLICY_INSTRUCTION_ATTACHMENTS: AgentFilePolicy = {
  min_files: 0,
  max_files: 20,
  max_file_size_mb: 50,
  max_total_size_mb: 500,
  allowed_mime_types: [],
  allowed_extensions: [],
  require_files_to_invoke: false,
  auto_ingest_to_rag: true,
  allow_all_types: true,
};

export const FILE_POLICY_WIZARD_ATTACHMENTS: AgentFilePolicy = {
  min_files: 0,
  max_files: 10,
  max_file_size_mb: 25,
  max_total_size_mb: 200,
  allowed_mime_types: [
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  allowed_extensions: [".pdf", ".txt", ".csv", ".xlsx", ".xls", ".doc", ".docx"],
  require_files_to_invoke: false,
  auto_ingest_to_rag: true,
};

export const FILE_POLICY_SPREADSHEET: AgentFilePolicy = {
  min_files: 1,
  max_files: 20,
  max_file_size_mb: 25,
  max_total_size_mb: 200,
  allowed_mime_types: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  allowed_extensions: [".xlsx", ".xls"],
  require_files_to_invoke: false,
  auto_ingest_to_rag: false,
};

export const FILE_POLICY_BULK_INTAKE: AgentFilePolicy = {
  min_files: 10,
  max_files: 1000,
  max_file_size_mb: 25,
  max_total_size_mb: 5000,
  require_files_to_invoke: true,
  allowed_mime_types: [
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  allowed_extensions: [".pdf", ".txt", ".csv", ".xlsx", ".xls"],
  auto_ingest_to_rag: true,
};

export const EMPTY_API_BINDINGS = { service_ids: [] as string[], endpoint_ids: [] as string[] };

export function parseApiBindings(config?: Record<string, unknown> | null): {
  service_ids: string[];
  endpoint_ids: string[];
} {
  const raw = (config?.api_bindings ?? {}) as Record<string, unknown>;
  return {
    service_ids: (raw.service_ids as string[] | undefined) ?? [],
    endpoint_ids: (raw.endpoint_ids as string[] | undefined) ?? [],
  };
}

export function filePolicyForCapabilities(
  caps: AgentCapabilities,
  toolNames: string[] = [],
): Partial<AgentFilePolicy> | undefined {
  if (!caps.file_upload_enabled) return undefined;
  if (toolNames.includes("run_agent_script")) return FILE_POLICY_SPREADSHEET;
  if (!caps.chat_enabled && !caps.actions_enabled) return FILE_POLICY_BULK_INTAKE;
  return undefined;
}

export const DEFAULT_FILE_POLICY: AgentFilePolicy = {
  min_files: 1,
  max_files: 100,
  max_file_size_mb: 25,
  max_total_size_mb: 500,
  allowed_mime_types: ["application/pdf", "text/plain", "text/csv"],
  allowed_extensions: [".pdf", ".txt", ".csv"],
  require_files_to_invoke: false,
  auto_ingest_to_rag: true,
};

export const FILE_POLICY_LOOSE: AgentFilePolicy = {
  min_files: 0,
  max_files: 20,
  max_file_size_mb: 50,
  max_total_size_mb: 500,
  allowed_mime_types: [],
  allowed_extensions: [],
  require_files_to_invoke: false,
  auto_ingest_to_rag: true,
  allow_all_types: true,
};

export const FILE_POLICY_DOCS_OUTPUT: AgentFilePolicy = {
  min_files: 0,
  max_files: 20,
  max_file_size_mb: 50,
  max_total_size_mb: 500,
  allowed_mime_types: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/pdf",
    "text/plain",
    "text/csv",
  ],
  allowed_extensions: [".xlsx", ".xls", ".docx", ".doc", ".pdf", ".txt", ".csv"],
  require_files_to_invoke: false,
  auto_ingest_to_rag: false,
  allow_all_types: false,
};

export const FILE_POLICY_PRESETS_PER_KIND: Record<AgentKind, IoFilePolicy> = {
  chat: { input: FILE_POLICY_LOOSE, output: FILE_POLICY_DOCS_OUTPUT },
  worker: { input: FILE_POLICY_BULK_INTAKE, output: FILE_POLICY_DOCS_OUTPUT },
  supervisor: { input: DEFAULT_FILE_POLICY, output: DEFAULT_FILE_POLICY },
  custom: { input: DEFAULT_FILE_POLICY, output: DEFAULT_FILE_POLICY },
};

export const DEFAULT_IO_POLICY: IoFilePolicy = { input: DEFAULT_FILE_POLICY, output: DEFAULT_FILE_POLICY };

/** Per-kind I/O file policy, mirroring backend file_policy_for_kind. */
export function filePolicyForKind(kind: AgentKind): IoFilePolicy {
  return FILE_POLICY_PRESETS_PER_KIND[canonicalAgentKind(kind)] ?? FILE_POLICY_PRESETS_PER_KIND.custom;
}

/** Read a single role's policy from either shape (IoFilePolicy or legacy flat). */
export function filePolicyForRole(
  policy: IoFilePolicy | AgentFilePolicy | undefined,
  role: "input" | "output",
): AgentFilePolicy {
  if (!policy) return role === "output" ? DEFAULT_FILE_POLICY : DEFAULT_FILE_POLICY;
  if ("input" in policy && "output" in policy) {
    return policy[role];
  }
  return policy as AgentFilePolicy;
}

/** Coerce any payload file_policy into the IoFilePolicy container shape. */
export function asIoFilePolicy(policy: IoFilePolicy | AgentFilePolicy | undefined): IoFilePolicy {
  if (!policy) return { input: DEFAULT_FILE_POLICY, output: DEFAULT_FILE_POLICY };
  if ("input" in policy && "output" in policy) {
    return policy as IoFilePolicy;
  }
  return { input: policy as AgentFilePolicy, output: DEFAULT_FILE_POLICY };
}

export const MIME_CHIPS = [
  { mime: "application/pdf", ext: ".pdf", label: "PDF" },
  { mime: "text/plain", ext: ".txt", label: "TXT" },
  { mime: "text/csv", ext: ".csv", label: "CSV" },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: ".xlsx",
    label: "Excel",
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: ".docx",
    label: "Word",
  },
  { mime: "application/msword", ext: ".doc", label: "DOC" },
  { mime: "application/json", ext: ".json", label: "JSON" },
  { mime: "text/markdown", ext: ".md", label: "MD" },
  { mime: "image/png", ext: ".png", label: "PNG" },
  { mime: "image/jpeg", ext: ".jpg", label: "JPG" },
] as const;

/** Merge instruction attachments policy when admin stages reference files. */
export function resolvePublishFileConfig(
  capabilities: AgentCapabilities,
  inputFilePolicy: AgentFilePolicy,
  outputFilePolicy: AgentFilePolicy,
  stagedFileCount: number,
  toolNames: string[] = []
): { capabilities: AgentCapabilities; filePolicy: IoFilePolicy } {
  if (stagedFileCount === 0 && !capabilities.file_upload_enabled) {
    return {
      capabilities,
      filePolicy: { input: inputFilePolicy, output: outputFilePolicy },
    };
  }
  const caps =
    stagedFileCount > 0 && !capabilities.file_upload_enabled
      ? { ...capabilities, file_upload_enabled: true }
      : capabilities;
  if (stagedFileCount > 0) {
    return {
      capabilities: caps,
      filePolicy: {
        input: {
          ...inputFilePolicy,
          ...FILE_POLICY_INSTRUCTION_ATTACHMENTS,
          min_files: inputFilePolicy.min_files,
          require_files_to_invoke: inputFilePolicy.require_files_to_invoke,
          auto_ingest_to_rag: inputFilePolicy.auto_ingest_to_rag ?? true,
        },
        output: {
          ...outputFilePolicy,
          ...FILE_POLICY_INSTRUCTION_ATTACHMENTS,
          min_files: outputFilePolicy.min_files,
          require_files_to_invoke: outputFilePolicy.require_files_to_invoke,
          auto_ingest_to_rag: outputFilePolicy.auto_ingest_to_rag ?? true,
        },
      },
    };
  }
  const fpPreset = filePolicyForCapabilities(caps, toolNames);
  return {
    capabilities: caps,
    filePolicy: {
      input: fpPreset ? { ...DEFAULT_FILE_POLICY, ...fpPreset } : inputFilePolicy,
      output: outputFilePolicy,
    },
  };
}

export function estimateCostMultiplier(caps: AgentCapabilities): number {
  let m = 1;
  if (caps.supervisor_enabled) m *= 2;
  if (caps.can_call_agents) m *= 1.3;
  if (caps.actions_enabled) m *= 1.1;
  if (caps.external_apis_enabled) m *= 1.15;
  return m;
}
