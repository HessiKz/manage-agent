import type { AgentCapabilities, AgentFilePolicy, AgentKind } from "@/types";

/** Only four agent types — everything else is a capability toggle. */
export const AGENT_KINDS: AgentKind[] = ["chat", "worker", "supervisor", "custom"];

export const KIND_LABELS: Record<AgentKind, string> = {
  chat: "گفت‌وگو",
  worker: "کارگر",
  supervisor: "سرپرست",
  custom: "سفارشی",
};

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
  if (toolNames.includes("karkard_process")) return FILE_POLICY_SPREADSHEET;
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
  filePolicy: AgentFilePolicy,
  stagedFileCount: number,
  toolNames: string[] = []
): { capabilities: AgentCapabilities; filePolicy: AgentFilePolicy } {
  if (stagedFileCount === 0 && !capabilities.file_upload_enabled) {
    return { capabilities, filePolicy };
  }
  const caps =
    stagedFileCount > 0 && !capabilities.file_upload_enabled
      ? { ...capabilities, file_upload_enabled: true }
      : capabilities;
  if (stagedFileCount > 0) {
    return {
      capabilities: caps,
      filePolicy: {
        ...filePolicy,
        ...FILE_POLICY_INSTRUCTION_ATTACHMENTS,
        min_files: filePolicy.min_files,
        require_files_to_invoke: filePolicy.require_files_to_invoke,
        auto_ingest_to_rag: filePolicy.auto_ingest_to_rag ?? true,
      },
    };
  }
  const fpPreset = filePolicyForCapabilities(caps, toolNames);
  return {
    capabilities: caps,
    filePolicy: fpPreset ? { ...DEFAULT_FILE_POLICY, ...fpPreset } : filePolicy,
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
