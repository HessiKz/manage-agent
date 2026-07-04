"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartBox } from "@/components/charts/chart-box";
import {
  axisX,
  axisY,
  barChartMargin,
  legendBottom,
  lineChartMargin,
  pieChartMargin,
  pieGeometry,
  tooltipContentStyle,
} from "@/components/charts/recharts-rtl";
import { StatCard } from "@/components/agents/agent-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { fetchDepartments, fetchPlatformHrSavings, fetchUsage } from "@/lib/api";
import { deptLabel } from "@/lib/utils";
import type { Overview, TopAgent } from "@/types";

const PIE_COLORS = ["#b86828", "#188858", "#2868a0", "#7858a0", "#c05878", "#9a5520"];

type Props = {
  topAgents: TopAgent[];
  overview?: Overview;
};

function truncateLabel(text: string, max = 18): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function DashboardInsightsPanel({ topAgents, overview }: Props) {
  const [days, setDays] = useState(30);

  const { data: hrSavings, isLoading: hrLoading } = useQuery({
    queryKey: ["platform-hr-savings"],
    queryFn: fetchPlatformHrSavings,
  });

  const { data: usage = [], isLoading: usageLoading } = useQuery({
    queryKey: ["usage", days],
    queryFn: () => fetchUsage(days),
  });

  const { data: departments = [], isLoading: deptLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: fetchDepartments,
  });

  const usageChart = useMemo(
    () =>
      usage.map((u) => ({
        day: u.day?.slice(5, 10) ?? "",
        runs: u.runs,
      })),
    [usage]
  );

  const topBarData = useMemo(
    () =>
      topAgents.slice(0, 6).map((a) => ({
        name: truncateLabel(a.name),
        runs: a.runs,
        fullName: a.name,
      })),
    [topAgents]
  );

  const deptPie = useMemo(
    () =>
      departments.map((d) => ({
        name: deptLabel(d.department),
        value: d.count,
      })),
    [departments]
  );

  const humanCost = hrSavings?.human_cost_irr ?? 0;
  const agentCost = hrSavings?.agent_cost_irr ?? 0;
  const humanPct =
    humanCost + agentCost > 0 ? Math.round((100 * humanCost) / (humanCost + agentCost)) : 50;
  const agentPct = 100 - humanPct;

  const totalRuns = overview?.runs.total ?? 0;
  const successfulRuns = overview?.runs.successful ?? 0;
  const successRate = overview?.success_rate ?? 0;
  const failedRuns = Math.max(0, totalRuns - successfulRuns);

  return (
    <Stagger delayChildren={0.04} staggerChildren={0.05} className="grid gap-4 lg:grid-cols-2">
      {overview && (
        <StaggerItem variant="scaleIn" className="min-w-0 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="اجراهای کل"
              value={totalRuns}
              hint={`${successfulRuns} موفق · ${failedRuns} ناموفق`}
              chartVariant="savings"
            />
            <StatCard
              label="نرخ موفقیت"
              value={`${successRate.toFixed(1)}٪`}
              hint={
                totalRuns > 0
                  ? `${successfulRuns} از ${totalRuns} اجرا`
                  : "هنوز اجرایی ثبت نشده"
              }
              chartVariant="accuracy"
            />
          </div>
        </StaggerItem>
      )}

      <StaggerItem variant="scaleIn" className="min-w-0">
        <Card className="h-full">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3 pb-2">
            <div>
              <h3 className="font-bold text-stone-900">روند اجراها</h3>
              <p className="mt-0.5 text-xs text-stone-500">تعداد اجرای ایجنت‌ها در بازه زمانی</p>
            </div>
            <div className="touch-scroll-x inline-flex max-w-full rounded-full border border-stone-200 bg-white p-1 text-xs">
              {[
                { d: 7, t: "۷ روز" },
                { d: 30, t: "۳۰ روز" },
              ].map((o) => (
                <button
                  key={o.d}
                  type="button"
                  onClick={() => setDays(o.d)}
                  className={
                    "rounded-full px-3 py-1.5 font-semibold transition " +
                    (days === o.d
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-stone-600 hover:bg-brand-50 hover:text-brand-800")
                  }
                >
                  {o.t}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardBody className="h-[220px] max-h-[220px] shrink-0 overflow-hidden pt-0">
            {usageLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">
                در حال بارگذاری…
              </div>
            ) : usageChart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">
                هنوز اجرایی ثبت نشده است
              </div>
            ) : (
              <ChartBox height={220} className="!min-h-0 !h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usageChart} margin={lineChartMargin}>
                    <defs>
                      <linearGradient id="runs-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#b86828" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#b86828" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d8" vertical={false} />
                    <XAxis dataKey="day" {...axisX} />
                    <YAxis {...axisY} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      formatter={(value: number) => [`${value} اجرا`, "تعداد"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="runs"
                      stroke="#b86828"
                      strokeWidth={2}
                      fill="url(#runs-fill)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
          </CardBody>
        </Card>
      </StaggerItem>

      <StaggerItem variant="scaleIn" className="min-w-0">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <h3 className="font-bold text-stone-900">پرکاربردترین ایجنت‌ها</h3>
            <p className="mt-0.5 text-xs text-stone-500">بر اساس تعداد اجرا در کل پلتفرم</p>
          </CardHeader>
          <CardBody className="h-[220px] max-h-[220px] shrink-0 overflow-hidden pt-0">
            {topBarData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">
                داده‌ای برای نمایش نیست
              </div>
            ) : (
              <ChartBox height={220} className="!min-h-0 !h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topBarData}
                    layout="vertical"
                    margin={{ ...barChartMargin, left: 4, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d8" horizontal={false} />
                    <XAxis type="number" {...axisX} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={88}
                      tick={axisY.tick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      formatter={(value: number, _n, item) => [
                        `${value} اجرا`,
                        (item?.payload as { fullName?: string })?.fullName ?? "",
                      ]}
                    />
                    <Bar dataKey="runs" fill="#2868a0" radius={[0, 6, 6, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
          </CardBody>
        </Card>
      </StaggerItem>

      <StaggerItem variant="scaleIn" className="min-w-0">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <h3 className="font-bold text-stone-900">توزیع ایجنت‌ها</h3>
            <p className="mt-0.5 text-xs text-stone-500">تعداد ایجنت فعال در هر دپارتمان</p>
          </CardHeader>
          <CardBody className="h-[220px] max-h-[220px] shrink-0 overflow-hidden pt-0">
            {deptLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">
                در حال بارگذاری…
              </div>
            ) : deptPie.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">
                دپارتمانی ثبت نشده است
              </div>
            ) : (
              <ChartBox height={220} className="!min-h-0 !h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={pieChartMargin}>
                    <Pie data={deptPie} dataKey="value" nameKey="name" {...pieGeometry}>
                      {deptPie.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      formatter={(value: number, name: string) => [`${value} ایجنت`, name]}
                    />
                    <Legend {...legendBottom} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
          </CardBody>
        </Card>
      </StaggerItem>

      <StaggerItem variant="scaleIn" className="min-w-0">
        <Card className="h-full border-accent-green/25 bg-gradient-to-l from-accent-green/5 via-white to-brand-50/30">
          <CardHeader className="flex flex-wrap items-start justify-between gap-2 pb-2">
            <div>
              <h3 className="font-bold text-stone-900">صرفه‌جویی نسبت به منابع انسانی</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                {hrSavings?.role_title ?? "منابع انسانی معادل"} ·{" "}
                {hrSavings?.period_label ?? "در حال محاسبه…"}
              </p>
            </div>
            {hrSavings && (
              <Badge variant={hrSavings.uses_live_activity ? "success" : "muted"}>
                {hrSavings.uses_live_activity ? "بر اساس اجرای واقعی" : "برآورد نمونه"}
              </Badge>
            )}
          </CardHeader>
          <CardBody className="flex h-[220px] flex-col justify-center gap-4 pt-0">
            {hrLoading ? (
              <p className="text-center text-sm text-stone-400">در حال محاسبه صرفه‌جویی…</p>
            ) : hrSavings ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-stone-100 bg-white/80 px-3 py-2.5">
                    <p className="text-[11px] text-stone-500">زمان صرفه‌جویی</p>
                    <p className="mt-1 text-lg font-bold text-accent-green">
                      {hrSavings.time_saved_label}
                    </p>
                  </div>
                  <div className="rounded-xl border border-stone-100 bg-white/80 px-3 py-2.5">
                    <p className="text-[11px] text-stone-500">صرفه‌جویی مالی</p>
                    <p className="mt-1 text-lg font-bold text-accent-green">
                      {hrSavings.money_saved_label}
                    </p>
                  </div>
                  <div className="rounded-xl border border-stone-100 bg-white/80 px-3 py-2.5">
                    <p className="text-[11px] text-stone-500">کاهش هزینه</p>
                    <p className="mt-1 text-lg font-bold text-brand-700">
                      {hrSavings.savings_percent}٪
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-stone-600">مقایسه هزینه کل (ریال)</p>
                  <div className="flex h-3 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="bg-stone-400 transition-all"
                      style={{ width: `${humanPct}%` }}
                      title={`کارمند: ${hrSavings.human_cost_label}`}
                    />
                    <div
                      className="bg-accent-green transition-all"
                      style={{ width: `${agentPct}%` }}
                      title={`ایجنت: ${hrSavings.agent_cost_label}`}
                    />
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-stone-600">
                    <span>
                      نیروی انسانی:{" "}
                      <strong className="text-stone-800">{hrSavings.human_cost_label}</strong>
                    </span>
                    <span>
                      ایجنت:{" "}
                      <strong className="text-accent-green">{hrSavings.agent_cost_label}</strong>
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400">
                    {hrSavings.run_count} اجرا · {hrSavings.agent_count ?? 0} ایجنت فعال
                  </p>
                </div>
              </>
            ) : (
              <p className="text-center text-sm text-stone-400">داده‌ای برای نمایش نیست</p>
            )}
          </CardBody>
        </Card>
      </StaggerItem>
    </Stagger>
  );
}
