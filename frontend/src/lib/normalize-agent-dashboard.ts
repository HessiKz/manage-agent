import type {
  AgentDashboard,
  AgentDashboardHrSavings,
  AgentDashboardRunSummary,
  AgentDashboardStatCard,
} from "@/types";

function pick<T>(obj: Record<string, unknown>, snake: string, camel: string): T | undefined {
  const v = obj[snake] ?? obj[camel];
  return v as T | undefined;
}

function num(obj: Record<string, unknown>, snake: string, camel: string, fallback = 0): number {
  const v = pick<number | string>(obj, snake, camel);
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(obj: Record<string, unknown>, snake: string, camel: string, fallback = ""): string {
  const v = pick<string>(obj, snake, camel);
  return v != null ? String(v) : fallback;
}

function normalizeHrSavings(raw: unknown): AgentDashboardHrSavings | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!str(r, "role_title", "roleTitle")) return null;

  return {
    role_title: str(r, "role_title", "roleTitle"),
    period_label: str(r, "period_label", "periodLabel"),
    uses_live_activity: Boolean(pick(r, "uses_live_activity", "usesLiveActivity")),
    run_count: num(r, "run_count", "runCount"),
    tokens_total: num(r, "tokens_total", "tokensTotal"),
    employee_monthly_salary_irr: num(r, "employee_monthly_salary_irr", "employeeMonthlySalaryIrr"),
    employee_hourly_irr: num(r, "employee_hourly_irr", "employeeHourlyIrr"),
    human_hours: num(r, "human_hours", "humanHours"),
    human_hours_label: str(r, "human_hours_label", "humanHoursLabel"),
    human_cost_irr: num(r, "human_cost_irr", "humanCostIrr"),
    human_cost_label: str(r, "human_cost_label", "humanCostLabel"),
    agent_hours: num(r, "agent_hours", "agentHours"),
    agent_hours_label: str(r, "agent_hours_label", "agentHoursLabel"),
    agent_cost_irr: num(r, "agent_cost_irr", "agentCostIrr"),
    agent_cost_label: str(r, "agent_cost_label", "agentCostLabel"),
    time_saved_hours: num(r, "time_saved_hours", "timeSavedHours"),
    time_saved_label: str(r, "time_saved_label", "timeSavedLabel"),
    money_saved_irr: num(r, "money_saved_irr", "moneySavedIrr"),
    money_saved_label: str(r, "money_saved_label", "moneySavedLabel"),
    savings_percent: num(r, "savings_percent", "savingsPercent"),
    usd_to_irr_rate: num(r, "usd_to_irr_rate", "usdToIrrRate", 620_000),
  };
}

function normalizeRunSummary(raw: unknown): AgentDashboardRunSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    total_runs: num(r, "total_runs", "totalRuns"),
    success_runs: num(r, "success_runs", "successRuns"),
    error_runs: num(r, "error_runs", "errorRuns"),
    avg_duration_label: str(r, "avg_duration_label", "avgDurationLabel"),
    cost_label: str(r, "cost_label", "costLabel"),
    tokens_total: num(r, "tokens_total", "tokensTotal"),
  };
}

function normalizeStatCards(raw: unknown): AgentDashboardStatCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const c = item as Record<string, unknown>;
    return {
      id: pick<string>(c, "id", "id"),
      label: str(c, "label", "label"),
      value: str(c, "value", "value"),
      hint: pick<string>(c, "hint", "hint"),
      chartVariant:
        pick<string>(c, "chart_variant", "chartVariant") ??
        pick<string>(c, "chartVariant", "chart_variant"),
    };
  });
}

function fallbackHrSavings(): AgentDashboardHrSavings {
  return {
    role_title: "کارشناس معادل",
    period_label: "داده در دسترس نیست",
    uses_live_activity: false,
    run_count: 0,
    tokens_total: 0,
    employee_monthly_salary_irr: 0,
    employee_hourly_irr: 0,
    human_hours: 0,
    human_hours_label: "—",
    human_cost_irr: 0,
    human_cost_label: "—",
    agent_hours: 0,
    agent_hours_label: "—",
    agent_cost_irr: 0,
    agent_cost_label: "—",
    time_saved_hours: 0,
    time_saved_label: "—",
    money_saved_irr: 0,
    money_saved_label: "—",
    savings_percent: 0,
    usd_to_irr_rate: 620_000,
  };
}

/** Normalize dashboard API payload (snake_case or camelCase) for the UI. */
export function normalizeAgentDashboard(data: Record<string, unknown>): AgentDashboard {
  const hrSavings =
    normalizeHrSavings(pick(data, "hr_savings", "hrSavings")) ??
    normalizeHrSavings(pick(data, "hrSavings", "hr_savings")) ??
    fallbackHrSavings();

  return {
    profile: str(data, "profile", "profile"),
    domain_label: str(data, "domain_label", "domainLabel", "عملیات"),
    panel_title: str(data, "panel_title", "panelTitle", "پنل ایجنت"),
    uses_live_runs: Boolean(pick(data, "uses_live_runs", "usesLiveRuns")),
    is_custom: Boolean(pick(data, "is_custom", "isCustom")),
    hide_hr_savings: Boolean(pick(data, "hide_hr_savings", "hideHrSavings")),
    has_pending_draft: Boolean(pick(data, "has_pending_draft", "hasPendingDraft")),
    is_draft_preview: Boolean(pick(data, "is_draft_preview", "isDraftPreview")),
    draft_unavailable: Boolean(pick(data, "draft_unavailable", "draftUnavailable")),
    stat_cards: normalizeStatCards(pick(data, "stat_cards", "statCards")),
    line_chart: (pick(data, "line_chart", "lineChart") as AgentDashboard["line_chart"]) ?? null,
    pie_chart: (pick(data, "pie_chart", "pieChart") as AgentDashboard["pie_chart"]) ?? null,
    review_table:
      (pick(data, "review_table", "reviewTable") as AgentDashboard["review_table"]) ?? null,
    run_summary: normalizeRunSummary(pick(data, "run_summary", "runSummary")),
    hr_savings: hrSavings,
  };
}
