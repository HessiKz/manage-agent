import type { AgentStatus } from "@/types";

export const PLANNING_LOCALE = "fa-IR";

export type ValidationReport = {
  ok?: boolean;
  state?: string;
  current_phase?: string;
  training_completed?: boolean;
  planning?: {
    analysis?: string;
    questions?: { id: string; text: string; context?: string }[];
    awaiting_answers?: boolean;
    answers?: Record<string, string>;
    locale?: string;
  };
  failures?: { phase: string; message: string; fixable_in_admin: boolean }[];
};

export const TEST_STEPS = [
  "پیش‌نمایش و تأیید پاسخ",
  "طراحی و تأیید پنل ایجنت",
  "بارگذاری تنظیمات ایجنت",
  "تحلیل عمیق ایجنت",
  "تست گفت‌وگو با هوش مصنوعی",
  "بررسی ابزارها و اقدامات",
  "جمع‌بندی نتیجه",
] as const;

/** True while admin must complete interactive training — not automated validation. */
export function isAwaitingInteractiveTraining(
  status: AgentStatus | undefined,
  validation: ValidationReport | null
): boolean {
  if (validation?.training_completed) return false;
  const state = validation?.state ?? "";
  const phase = validation?.current_phase ?? "";
  if (state === "training" || phase === "training") return true;
  // Wizard publish leaves agents here until /training/start runs.
  if (state === "runtime_prepare" || phase === "runtime_prepare") return true;
  if (
    (state === "pending" || !state) &&
    (status === "deploying" || status === "draft")
  ) {
    return true;
  }
  return false;
}

export function needsTrainingBootstrap(validation: ValidationReport | null): boolean {
  if (validation?.training_completed) return false;
  const state = validation?.state ?? "";
  const phase = validation?.current_phase ?? "";
  return state === "runtime_prepare" || phase === "runtime_prepare";
}

export function resolveTestingPhase(
  status: AgentStatus | undefined,
  validation: ValidationReport | null
): "training" | "dashboard_review" | "testing" | "success" | "error" | "warning" {
  if (
    validation?.planning?.awaiting_answers &&
    (validation.planning?.questions?.length ?? 0) > 0
  ) {
    return "testing";
  }
  if (status === "active" && validation?.state === "done") return "success";
  if (status === "active" && !validation?.state) return "success";
  if (status === "active") return "testing";
  if (status === "error") return "error";
  if (status === "draft" && validation?.state === "done") return "warning";
  if (isAwaitingInteractiveTraining(status, validation)) return "training";
  if (validation?.state === "dashboard_review" || validation?.current_phase === "dashboard_review") {
    return "dashboard_review";
  }
  return "testing";
}

/** Map backend validation phase → wizard step index (0–6) for automated testing only. */
export function validationStepIndex(validation: ValidationReport | null): number {
  const phase = validation?.current_phase ?? "";
  const state = validation?.state ?? "";
  if (state === "training" || phase === "training") return 0;
  if (state === "pending" && !validation?.training_completed) return 0;
  if (state === "dashboard_review" || phase === "dashboard_review") return 1;
  if (state === "done" || phase === "done") return 6;
  if (state === "error" || phase === "error") return 6;
  if (phase === "finishing") return 6;
  if (phase === "planning") return 3;
  if (phase === "invoke") return 4;
  if (phase.startsWith("action:") || phase === "actions") return 5;
  if (
    phase.startsWith("script_") ||
    phase === "runtime_prepare" ||
    phase === "starting" ||
    phase === "instruction_compile" ||
    phase === "file_setup"
  ) {
    return 2;
  }
  if (state === "running" || state === "pending_auto") return 2;
  return 0;
}

/** Steps 0–1 only complete after real training / dashboard approval — not when automation starts. */
export function completedWizardSteps(validation: ValidationReport | null): number {
  if (!validation?.training_completed) return -1;
  const state = validation?.state ?? "";
  if (state === "dashboard_review") return 0;
  if (state === "running" || state === "pending_auto" || state === "done" || state === "error") {
    return 1;
  }
  return 0;
}
