"use client";

import { useQuery } from "@tanstack/react-query";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ClientNumber } from "@/components/ui/client-date";
import { DashboardCol, DashboardTwoColRow } from "@/components/layout/dashboard-card-grid";
import { fetchAgentDashboard } from "@/lib/api";
import { formatMetricDelta } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

const PIE_COLORS = ["#b86828", "#c88848", "#e8c8a8", "#2868a0", "#7858a0"] as const;

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

export function AgentOverviewPanel({ agentId }: { agentId: string }) {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["agent-dashboard", agentId],
    queryFn: () => fetchAgentDashboard(agentId),
  });

  if (isLoading || !dashboard) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  const lineData = dashboard.line_chart?.points ?? [];
  const pieData = dashboard.pie_chart?.slices ?? [];

  return (
    <Stagger delayChildren={0.04} staggerChildren={0.05} className="space-y-4">
      <StaggerItem variant="fadeIn">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-stone-900">{dashboard.panel_title}</h2>
            <p className="text-xs text-stone-500">{dashboard.domain_label}</p>
          </div>
          <Badge variant="muted">{dashboard.profile}</Badge>
        </div>
      </StaggerItem>

      {dashboard.hr_savings ? (
        <AgentHrSavingsPanel savings={dashboard.hr_savings} />
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

      <Stagger delayChildren={0.02} staggerChildren={0.05} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {dashboard.stat_cards.map((card) => (
          <StaggerItem key={card.label} variant="scaleIn">
            <StatCard
              label={card.label}
              value={card.value}
              hint={card.hint}
              chartVariant={isChartVariant(card.chartVariant) ? card.chartVariant : undefined}
            />
          </StaggerItem>
        ))}
      </Stagger>

      {(dashboard.line_chart || dashboard.pie_chart) && (
        <DashboardTwoColRow className="gap-4">
          {dashboard.line_chart && (
            <DashboardCol>
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
            </DashboardCol>
          )}

          {dashboard.pie_chart && pieData.length > 0 && (
            <DashboardCol>
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
            </DashboardCol>
          )}
        </DashboardTwoColRow>
      )}

      {dashboard.review_table && dashboard.review_table.rows.length > 0 && (
        <StaggerItem variant="slideUp">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">{dashboard.review_table.title}</h3>
                <div className="flex gap-2">
                  <Button variant="secondary">رد همه</Button>
                  <Button>تأیید همه</Button>
                </div>
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
                    <th className="py-2 text-right font-semibold">اقدام</th>
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
                    </StaggerItem>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </StaggerItem>
      )}
    </Stagger>
  );
}
