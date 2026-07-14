import type { Agent, AgentFilePolicy } from "@/types";
import { asIoFilePolicy } from "@/lib/agent-presets";

/** Relaxed upload policy during interactive training (backend mirrors this). */
export const TRAINING_ATTACHMENT_POLICY: AgentFilePolicy = {
  min_files: 0,
  max_files: 10,
  max_file_size_mb: 25,
  max_total_size_mb: 150,
  allowed_mime_types: [
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  allowed_extensions: [".pdf", ".txt", ".csv", ".xlsx", ".xls", ".doc", ".docx"],
  require_files_to_invoke: false,
  auto_ingest_to_rag: true,
  allow_all_types: false,
};

export function trainingAttachmentPolicy(agent: Agent): AgentFilePolicy {
  if (agent.capabilities?.file_upload_enabled && agent.file_policy) {
    return asIoFilePolicy(agent.file_policy).input;
  }
  return TRAINING_ATTACHMENT_POLICY;
}
