/** Helpers for agent dashboard draft storage (config_json.dashboard). */

export function hasDashboardDraft(configJson?: Record<string, unknown> | null): boolean {
  const bucket = configJson?.dashboard;
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) return false;
  return Boolean((bucket as Record<string, unknown>).draft);
}

export function applyWidgetHighlight(
  widgetKind: string | undefined,
  durationMs = 4500
): void {
  document.querySelectorAll(".ma-widget-highlight").forEach((el) => {
    el.classList.remove("ma-widget-highlight");
  });
  if (!widgetKind) return;

  const el = document.querySelector(`[data-ma-widget="${widgetKind}"]`);
  if (!el) return;

  el.classList.add("ma-widget-highlight");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => el.classList.remove("ma-widget-highlight"), durationMs);
}

/** Force live + draft dashboard queries to refetch (including inactive cache entries). */
export async function invalidateAgentDashboardQueries(
  qc: { invalidateQueries: (opts: {
    queryKey: unknown[];
    refetchType?: "active" | "inactive" | "all" | "none";
  }) => Promise<unknown> },
  agentId: string
) {
  await qc.invalidateQueries({
    queryKey: ["agent-dashboard", agentId],
    refetchType: "all",
  });
}
