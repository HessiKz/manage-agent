import { fetchAgentBySlug, updateAgent, type DashboardWidgetKind } from "@/lib/api";
import {
  isWidgetEnabledInPlan,
  parseWidgetPlan,
  widgetPlanToConfigJson,
  type AgentWidgetPlan,
} from "@/lib/widget-plan";

function enableWidgetInPlan(plan: AgentWidgetPlan, kind: DashboardWidgetKind): AgentWidgetPlan {
  switch (kind) {
    case "stat_cards":
      return { ...plan, stat_cards: { ...plan.stat_cards, enabled: true } };
    case "line_chart":
      return { ...plan, line_chart: { ...plan.line_chart, enabled: true } };
    case "pie_chart":
      return { ...plan, pie_chart: { ...plan.pie_chart, enabled: true } };
    case "review_table":
      return { ...plan, review_table: { ...plan.review_table, enabled: true } };
    case "hr_savings":
      return { ...plan, hr_savings: { ...plan.hr_savings, enabled: true } };
    default:
      return plan;
  }
}

/** Enable a dashboard widget in the agent's persisted widget_plan (support automation). */
export async function ensureAgentWidgetEnabled(
  agentId: string,
  slug: string,
  kind: DashboardWidgetKind
): Promise<boolean> {
  const agent = await fetchAgentBySlug(slug);
  const cfg = (agent.config_json ?? {}) as Record<string, unknown>;
  const plan = parseWidgetPlan(cfg, agent.department, agent.description ?? "");
  if (isWidgetEnabledInPlan(plan, kind)) return false;

  const next = enableWidgetInPlan(plan, kind);
  await updateAgent(agentId, {
    config_json: {
      ...cfg,
      ...widgetPlanToConfigJson(next),
    },
  });
  return true;
}

export function isWidgetDisabledError(message: string): boolean {
  return /ویجت «.+» در مرحله ساخت ایجنت فعال نشده/u.test(message);
}
