/** Validation state from agent.config_json.validation */

import type { Agent } from "@/types";

export type ValidationReport = {
  ok?: boolean;
  state?: string;
  current_phase?: string;
  training_completed?: boolean;
  failures?: { phase: string; message: string; fixable_in_admin: boolean }[];
};

export function parseAgentValidation(agent: Agent | undefined): ValidationReport | null {
  const raw = agent?.config_json?.validation;
  if (!raw || typeof raw !== "object") return null;
  return raw as ValidationReport;
}

export function agentInCreationWizard(agent: Agent | undefined): boolean {
  if (!agent) return false;
  const validation = parseAgentValidation(agent);
  const state = validation?.state;
  if (agent.status === "deploying") {
    if (state === "done" || state === "cancelled") return false;
    return true;
  }
  return state === "training" || state === "dashboard_review" || state === "running";
}
