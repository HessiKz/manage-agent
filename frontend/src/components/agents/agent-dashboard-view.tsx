"use client";

import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AgentHrSavingsPanel } from "@/components/agents/agent-hr-savings-panel";
import {
  DashboardAddWidgetTile,
  DashboardWidgetShell,
  WidgetPickerPopover,
} from "@/components/agents/dashboard-widget-chrome";
import { ChartBox } from "@/components/charts/chart-box";
import {
  axisXMonth,
  axisY,
  legendBottom,
  legendTop,
  lineChartMargin,
  pieChartMargin,
  pieGeometry,
  tooltipContentStyle,
} from "@/components/charts/recharts-rtl";
import { StatCard } from "@/components/agents/agent-card";
import type { StatCardChartVariant } from "@/components/charts/stat-card-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ClientNumber } from "@/components/ui/client-date";
import { DashboardCol, DashboardTwoColRow } from "@/components/layout/dashboard-card-grid";
import type { DashboardWidgetKind } from "@/lib/api";
import { formatMetricDelta } from "@/lib/utils";
import { builderTypeFromDashboardKind, type BuilderWidgetType } from "@/lib/widget-builder";
import { isWidgetEnabledInPlan, parseWidgetPlan, type AgentWidgetPlan } from "@/lib/widget-plan";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { AgentDashboard } from "@/types";

const PIE_COLORS = ["#b86828", "#c88848", "#e8c8a8", "#2868a0", "#7858a0"] as const;

export const WIDGET_LABELS: Record<DashboardWidgetKind, string> = {
  stat_cards: "شاخص‌های کلیدی",
  line_chart: "نمودار خطی",
  pie_chart: "نمودار دایره‌ای",
  review_table: "جدول بازبینی",
  hr_savings: "صرفه‌جویی نیروی انسانی",
};

const ALL_WIDGETS: DashboardWidgetKind[] = [
  "stat_cards",
  "line_chart",
  "pie_chart",
  "review_table",
  "hr_savings",
];

function isChartVariant(v: string | undefined): v is StatCardChartVariant {
  if (!v) return false;
  const allowed: StatCardChartVariant[] = [
    "savings",
    "hours",
    "alerts",
    "accuracy",
    "payroll-headcount",
    "payroll-payout",
    "payroll-review",
    "payroll-tax",
  ];
  return allowed.includes(v as StatCardChartVariant);
}

function widgetVisible(dashboard: AgentDashboard, kind: DashboardWidgetKind): boolean {
  if (kind === "stat_cards") return (dashboard.stat_cards?.length ?? 0) > 0;
  if (kind === "line_chart") return Boolean(dashboard.line_chart);
  if (kind === "pie_chart") return Boolean(dashboard.pie_chart?.slices?.length);
  if (kind === "review_table") return Boolean(dashboard.review_table?.rows?.length);
  if (kind === "hr_savings") return !dashboard.hide_hr_savings;
  return false;
}

type Props = {
  dashboard: AgentDashboard;
  preview?: boolean;
  showReviewActions?: boolean;
  editable?: boolean;
  onRemoveWidget?: (kind: DashboardWidgetKind) => void;
  onRemoveStatCard?: (cardId: string) => void;
  onEnableWidget?: (kind: DashboardWidgetKind) => void;
  onCreateCustomWidget?: (type?: BuilderWidgetType) => void;
  removingWidget?: DashboardWidgetKind | null;
  removingStatCardId?: string | null;
  widgetPlan?: AgentWidgetPlan;
};

export function AgentDashboardView({
  dashboard,
  preview,
  showReviewActions,
  editable,
  onRemoveWidget,
  onRemoveStatCard,
  onEnableWidget,
  onCreateCustomWidget,
  removingWidget,
  removingStatCardId,
  widgetPlan: widgetPlanProp,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const addWidgetAnchorRef = useRef<HTMLDivElement>(null);
  const lineData = dashboard.line_chart?.points ?? [];
  const pieData = dashboard.pie_chart?.slices ?? [];
  const widgetPlan = widgetPlanProp ?? parseWidgetPlan(null);

  const widgetAllowed = (kind: DashboardWidgetKind) =>
    editable || isWidgetEnabledInPlan(widgetPlan, kind);

  const availableToAdd = useMemo(() => {
    const base = ALL_WIDGETS.filter((k) => {
      if (k === "stat_cards") return false;
      return !widgetVisible(dashboard, k);
    }).map((kind) => ({
      kind,
      label: WIDGET_LABELS[kind],
      locked: false,
      lockReason: undefined,
    }));
    if (editable) {
      base.unshift({
        kind: "stat_cards",
        label: "+ شاخص کلیدی جدید",
        locked: false,
        lockReason: undefined,
      });
    }
    return base;
  }, [dashboard, editable]);

  return (
    <Stagger delayChildren={0.04} staggerChildren={0.05} className="space-y-4">
      <StaggerItem variant="fadeIn">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-stone-900">{dashboard.panel_title}</h2>
            <p className="text-xs text-stone-500">{dashboard.domain_label}</p>
          </div>
          <div className="flex items-center gap-2">
            {preview && <Badge variant="warning">پیش‌نمایش</Badge>}
            {dashboard.is_custom && <Badge variant="success">اختصاصی</Badge>}
            <Badge variant="muted">{dashboard.profile}</Badge>
          </div>
        </div>
      </StaggerItem>

      {!dashboard.hide_hr_savings &&
      widgetAllowed("hr_savings") &&
      dashboard.hr_savings ? (
        <DashboardWidgetShell
          editable={editable}
          title={WIDGET_LABELS.hr_savings}
          widgetKind="hr_savings"
          onRemove={onRemoveWidget ? () => onRemoveWidget("hr_savings") : undefined}
          removing={removingWidget === "hr_savings"}
        >
          <AgentHrSavingsPanel savings={dashboard.hr_savings} />
        </DashboardWidgetShell>
      ) : null}

      {dashboard.run_summary && (
        <StaggerItem variant="fadeIn">
          <Card className="border-surface-border bg-surface-muted/30">
            <CardBody className="flex flex-wrap gap-4 py-3 text-xs text-stone-600">
              <span>
                <strong className="text-stone-800">اجرای ثبت‌شده:</strong>{" "}
                {dashboard.run_summary.total_runs} (موفق {dashboard.run_summary.success_runs} · خطا{" "}
                {dashboard.run_summary.error_runs})
              </span>
              <span>
                <strong className="text-stone-800">میانگین مدت:</strong>{" "}
                {dashboard.run_summary.avg_duration_label}
              </span>
              <span>
                <strong className="text-stone-800">هزینه API:</strong>{" "}
                {dashboard.run_summary.cost_label}
              </span>
              <span dir="ltr">
                <strong className="text-stone-800">توکن:</strong>{" "}
                <ClientNumber value={dashboard.run_summary.tokens_total} />
              </span>
            </CardBody>
          </Card>
        </StaggerItem>
      )}

      {(widgetAllowed("stat_cards") || dashboard.stat_cards.length > 0) &&
        dashboard.stat_cards.length > 0 && (
        <Stagger
          delayChildren={0.02}
          staggerChildren={0.05}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          data-ma-widget="stat_cards"
        >
          {dashboard.stat_cards.map((card) => (
            <StaggerItem key={card.id ?? card.label} variant="scaleIn">
              <DashboardWidgetShell
                editable={editable}
                title={card.label}
                onRemove={
                  onRemoveStatCard && card.id
                    ? () => onRemoveStatCard(card.id!)
                    : onRemoveWidget
                      ? () => onRemoveWidget("stat_cards")
                      : undefined
                }
                removing={
                  card.id && removingStatCardId === card.id
                    ? true
                    : removingWidget === "stat_cards"
                }
              >
                <StatCard
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  chartVariant={isChartVariant(card.chartVariant) ? card.chartVariant : undefined}
                />
              </DashboardWidgetShell>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {((widgetAllowed("line_chart") && dashboard.line_chart) ||
        (widgetAllowed("pie_chart") && dashboard.pie_chart)) && (
        <DashboardTwoColRow className="gap-4">
          {widgetAllowed("line_chart") && dashboard.line_chart && (
            <DashboardCol>
              <DashboardWidgetShell
                editable={editable}
                title={WIDGET_LABELS.line_chart}
                widgetKind="line_chart"
                onRemove={onRemoveWidget ? () => onRemoveWidget("line_chart") : undefined}
                removing={removingWidget === "line_chart"}
              >
                <Card className="w-full">
                  <CardHeader>
                    <h3 className="font-bold">{dashboard.line_chart.title}</h3>
                  </CardHeader>
                  <CardBody className="h-[220px] overflow-hidden pt-0">
                    <ChartBox height={220} className="!min-h-0 h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={lineData} margin={lineChartMargin}>
                          <CartesianGrid stroke="#e8e0d8" vertical={false} />
                          <XAxis dataKey="month" {...axisXMonth} />
                          <YAxis {...axisY} />
                          <Tooltip contentStyle={tooltipContentStyle} />
                          <Legend {...legendTop} />
                          {dashboard.line_chart.series.map((s, idx) => (
                            <Line
                              key={s.dataKey}
                              type="monotone"
                              dataKey={s.dataKey}
                              name={s.name}
                              stroke={PIE_COLORS[idx % PIE_COLORS.length]}
                              strokeWidth={2}
                              strokeDasharray={s.dashed ? "6 4" : undefined}
                              dot={{ r: 3 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartBox>
                  </CardBody>
                </Card>
              </DashboardWidgetShell>
            </DashboardCol>
          )}

          {widgetAllowed("pie_chart") &&
            dashboard.pie_chart &&
            pieData.length > 0 && (
            <DashboardCol>
              <DashboardWidgetShell
                editable={editable}
                title={WIDGET_LABELS.pie_chart}
                widgetKind="pie_chart"
                onRemove={onRemoveWidget ? () => onRemoveWidget("pie_chart") : undefined}
                removing={removingWidget === "pie_chart"}
              >
                <Card className="w-full">
                  <CardHeader>
                    <h3 className="font-bold">{dashboard.pie_chart.title}</h3>
                  </CardHeader>
                  <CardBody className="h-[220px] overflow-hidden pt-0">
                    <ChartBox height={220} className="!min-h-0 h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={pieChartMargin}>
                          <Tooltip contentStyle={tooltipContentStyle} />
                          <Pie data={pieData} dataKey="value" nameKey="name" {...pieGeometry}>
                            {pieData.map((_, idx) => (
                              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Legend {...legendBottom} />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartBox>
                  </CardBody>
                </Card>
              </DashboardWidgetShell>
            </DashboardCol>
          )}
        </DashboardTwoColRow>
      )}

      {widgetAllowed("review_table") &&
        dashboard.review_table &&
        dashboard.review_table.rows.length > 0 && (
        <DashboardWidgetShell
          editable={editable}
          title={WIDGET_LABELS.review_table}
          widgetKind="review_table"
          onRemove={onRemoveWidget ? () => onRemoveWidget("review_table") : undefined}
          removing={removingWidget === "review_table"}
        >
          <StaggerItem variant="slideUp">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">{dashboard.review_table.title}</h3>
                  {showReviewActions && (
                    <div className="flex gap-2">
                      <Button variant="secondary">رد همه</Button>
                      <Button>تأیید همه</Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardBody className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-xs text-stone-400">
                      {dashboard.review_table.columns.map((col) => (
                        <th key={col.key} className="py-2 text-right font-semibold">
                          {col.label}
                        </th>
                      ))}
                      {showReviewActions && (
                        <th className="py-2 text-right font-semibold">اقدام</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.review_table.rows.map((r, idx) => (
                      <StaggerItem
                        key={r.id}
                        variant="slideRight"
                        as="tr"
                        className="border-t border-stone-100"
                        customTransition={{ delay: idx * 0.04 }}
                      >
                        {dashboard.review_table!.columns.map((col) => {
                          const val = r.cells[col.key] ?? "—";
                          const isDelta = col.key === "delta";
                          return (
                            <td key={col.key} className="py-3 text-stone-600">
                              {isDelta ? (
                                <Badge variant="risk" dir="ltr" className="font-bold">
                                  {formatMetricDelta(val)}
                                </Badge>
                              ) : col.key === "employee" || col.key === "id" ? (
                                <span className="font-semibold text-stone-800">{val}</span>
                              ) : (
                                val
                              )}
                            </td>
                          );
                        })}
                        {showReviewActions && (
                          <td className="py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button className="!px-3 !py-1.5 text-xs">تأیید</Button>
                              <Button
                                variant="secondary"
                                className="!px-3 !py-1.5 text-xs hover:border-accent-red/30 hover:bg-[#f5e0e0] hover:text-accent-red"
                              >
                                رد
                              </Button>
                            </div>
                          </td>
                        )}
                      </StaggerItem>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          </StaggerItem>
        </DashboardWidgetShell>
      )}

      {editable && (
        <StaggerItem variant="scaleIn">
          <div ref={addWidgetAnchorRef} className="relative max-w-xs">
            <DashboardAddWidgetTile onClick={() => setPickerOpen((v) => !v)} />
            <WidgetPickerPopover
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              anchorRef={addWidgetAnchorRef}
              options={availableToAdd}
              onPick={(kind) => {
                const opt = availableToAdd.find((o) => o.kind === kind);
                if (opt?.locked) return;
                const builderType = builderTypeFromDashboardKind(kind as DashboardWidgetKind);
                if (builderType && onCreateCustomWidget) {
                  onCreateCustomWidget(builderType);
                  setPickerOpen(false);
                  return;
                }
                onEnableWidget?.(kind as DashboardWidgetKind);
                setPickerOpen(false);
              }}
              onCreateCustom={() => {
                onCreateCustomWidget?.();
              }}
              createCustomLocked={false}
            />
          </div>
        </StaggerItem>
      )}
    </Stagger>
  );
}
