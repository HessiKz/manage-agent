"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Pencil, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  tooltipContentStyle,
} from "@/components/charts/recharts-rtl";
import { StatCard } from "@/components/agents/agent-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  DashboardCol,
  DashboardFourCardGrid,
} from "@/components/layout/dashboard-card-grid";
import {
  fetchEvents,
  fetchHealth,
  fetchOverview,
  fetchBudgetSummary,
  fetchTopAgents,
  fetchUsage,
  fetchAgents,
  pauseDeployingAgent,
  deleteAgent,
} from "@/lib/api";
import { deptLabel, statusLabel } from "@/lib/utils";
import { appAlert, appConfirm } from "@/lib/app-dialog";
import { ClientDateTime } from "@/components/ui/client-date";
import { LlmProviderPanel } from "@/components/admin/llm-provider-panel";
import { useAuthStore } from "@/stores/auth-store";
import type { Agent } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

function AgentAdminRow({
  agent: a,
  busyId,
  onPause,
  onDelete,
  pipeline = false,
}: {
  agent: Agent;
  busyId: string | null;
  onPause: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  pipeline?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50/60 px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-stone-900">{a.name}</p>
        <p className="truncate text-xs text-stone-500">
          {deptLabel(a.department)} · {a.slug}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            a.status === "error"
              ? "warning"
              : a.status === "active"
                ? "success"
                : "default"
          }
        >
          {statusLabel(a.status)}
        </Badge>
        {(a.status === "active" || a.status === "draft" || a.status === "paused") && (
          <Link
            href={`/agents/create?slug=${a.slug}&mode=edit`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <Pencil className="h-3 w-3" />
            ویرایش
          </Link>
        )}
        {a.status === "active" && (
          <Link
            href={`/agents/${a.slug}`}
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            داشبورد
          </Link>
        )}
        {pipeline && a.status === "deploying" && (
          <>
            <Link
              href={`/agents/create?slug=${a.slug}`}
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              مشاهده تست
            </Link>
            <button
              type="button"
              disabled={busyId === a.id}
              onClick={() => onPause(a)}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
              title="توقف استقرار"
            >
              {busyId === a.id ? (
                <LoadingSpinner />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
              توقف
            </button>
          </>
        )}
        {pipeline && a.status === "error" && (
          <Link
            href={`/agents/${a.slug}/fix`}
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            اصلاح
          </Link>
        )}
        <button
          type="button"
          disabled={busyId === a.id}
          onClick={() => onDelete(a)}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-accent-red transition hover:border-accent-red/40 hover:bg-accent-red/5 disabled:opacity-50"
          title="حذف ایجنت"
        >
          {busyId === a.id ? (
            <LoadingSpinner />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          حذف
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const isSuperuser = useAuthStore((s) => s.user?.is_superuser);
  const [days, setDays] = useState(30);
  const [busyId, setBusyId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data: overview } = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  const { data: topAgents = [] } = useQuery({
    queryKey: ["top-agents"],
    queryFn: () => fetchTopAgents(),
  });
  const { data: usage = [] } = useQuery({
    queryKey: ["usage", days],
    queryFn: () => fetchUsage(days),
  });
  const { data: health = [] } = useQuery({ queryKey: ["health"], queryFn: fetchHealth });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const { data: budgetSummary } = useQuery({ queryKey: ["budget-summary"], queryFn: fetchBudgetSummary });
  const { data: pipelineAgents = [] } = useQuery({
    queryKey: ["agents-pipeline"],
    queryFn: async () => {
      const [deploying, errors] = await Promise.all([
        fetchAgents({ catalog_only: false, status: "deploying", page_size: 20 }),
        fetchAgents({ catalog_only: false, status: "error", page_size: 10 }),
      ]);
      return [...deploying.items, ...errors.items];
    },
    refetchInterval: 5000,
  });
  const { data: allAgentsPage } = useQuery({
    queryKey: ["admin-all-agents"],
    queryFn: () => fetchAgents({ catalog_only: false, page_size: 100 }),
  });
  const allAgents = allAgentsPage?.items ?? [];

  const unifiedAgents = useMemo(() => {
    const pipelineIds = new Set(pipelineAgents.map((a) => a.id));
    const rest = allAgents.filter((a) => !pipelineIds.has(a.id));
    return [
      ...pipelineAgents.map((a) => ({ agent: a, pipeline: true as const })),
      ...rest.map((a) => ({ agent: a, pipeline: false as const })),
    ];
  }, [pipelineAgents, allAgents]);

  async function handlePause(agent: Agent) {
    if (agent.status !== "deploying") return;
    const ok = await appConfirm({
      title: "توقف استقرار",
      message: `استقرار «${agent.name}» متوقف شود؟`,
      confirmLabel: "توقف",
      tone: "default",
    });
    if (!ok) return;
    setBusyId(agent.id);
    try {
      await pauseDeployingAgent(agent.id);
      await qc.invalidateQueries({ queryKey: ["agents-pipeline"] });
    } catch {
      await appAlert({
        title: "خطا",
        message: "توقف استقرار ممکن نشد.",
        tone: "danger",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(agent: Agent) {
    const ok = await appConfirm({
      title: "حذف ایجنت",
      message: `ایجنت «${agent.name}» برای همیشه حذف شود؟ این عمل قابل بازگشت نیست.`,
      confirmLabel: "حذف دائمی",
      cancelLabel: "انصراف",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(agent.id);
    try {
      await deleteAgent(agent.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["agents-pipeline"] }),
        qc.invalidateQueries({ queryKey: ["admin-all-agents"] }),
        qc.invalidateQueries({ queryKey: ["agents"] }),
        qc.invalidateQueries({ queryKey: ["overview"] }),
        qc.invalidateQueries({ queryKey: ["departments"] }),
        qc.invalidateQueries({ queryKey: ["sidebar-counts"] }),
      ]);
    } catch {
      await appAlert({
        title: "خطا",
        message: "حذف ایجنت ممکن نشد.",
        tone: "danger",
      });
    } finally {
      setBusyId(null);
    }
  }

  const chartData = usage.map((u) => ({
    day:
      days === 1
        ? (u.day?.slice(11, 16) ?? "")
        : (u.day?.slice(5, 10) ?? ""),
    runs: u.runs,
  }));

  return (
    <div className="page-padding space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">نمای کلی پلتفرم</h1>
          <p className="text-sm text-stone-500 sm:text-base">مصرف، سلامت سیستم و رویدادها</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Link href="/agents/create">
            <Button>ایجنت جدید</Button>
          </Link>
        </div>
      </div>

      {isSuperuser && (
        <details className="group rounded-2xl border border-stone-200 bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-stone-800 marker:content-none [&::-webkit-details-marker]:hidden">
            تنظیمات ارائه‌دهنده مدل (LLM)
            <span className="mr-2 text-xs font-normal text-stone-500">— برای باز کردن کلیک کنید</span>
          </summary>
          <div className="border-t border-stone-100 px-2 pb-2">
            <LlmProviderPanel />
          </div>
        </details>
      )}

      {overview && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <StatCard label="کاربران" value={overview.users.total} />
          <StatCard label="ایجنت‌های فعال" value={overview.agents.active} />
          <StatCard label="کل ایجنت‌ها" value={overview.agents.total} />
          <StatCard label="دپارتمان‌ها" value={overview.departments.total} />
          <StatCard
            label="اجراهای کل"
            value={overview.runs.total}
            hint={`${overview.runs.successful} موفق · ${Math.max(0, overview.runs.total - overview.runs.successful)} ناموفق`}
            chartVariant="savings"
          />
          <StatCard
            label="نرخ موفقیت"
            value={`${overview.success_rate.toFixed(1)}٪`}
            hint={`${overview.runs.successful} از ${overview.runs.total} اجرا`}
            chartVariant="accuracy"
          />
          <StatCard label="هزینه (USD)" value={`$${overview.total_cost_usd.toFixed(2)}`} />
          {budgetSummary && (
            <>
              <StatCard
                label="بودجه کل (USD)"
                value={`$${budgetSummary.total_budget_usd.toFixed(0)}`}
              />
              <StatCard
                label="هشدار بودجه"
                value={budgetSummary.alerts.length}
                hint={budgetSummary.alerts.length ? "⚠ نیازمند بررسی" : undefined}
              />
            </>
          )}
        </div>
      )}

      <Card data-ma-guide="admin-agents">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold">همه ایجنت‌ها</h3>
            <p className="mt-0.5 text-xs text-stone-500">
              شامل استقرار و خطا · {unifiedAgents.length} ایجنت · به‌روزرسانی خودکار
            </p>
          </div>
          <Link href="/agents/create">
            <Button variant="secondary">ایجنت جدید</Button>
          </Link>
        </CardHeader>
        <CardBody className="max-h-[420px] space-y-2 overflow-y-auto">
          {unifiedAgents.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-400">ایجنتی ثبت نشده است.</p>
          )}
          {unifiedAgents.map(({ agent: a, pipeline }) => (
            <AgentAdminRow
              key={a.id}
              agent={a}
              busyId={busyId}
              onPause={handlePause}
              onDelete={handleDelete}
              pipeline={pipeline}
            />
          ))}
        </CardBody>
      </Card>

      <DashboardFourCardGrid>
        <DashboardCol slot="topRight">
        <Card className="h-fit w-full">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold">مصرف ایجنت‌ها</h3>
            <div className="touch-scroll-x inline-flex max-w-full rounded-full border border-stone-200 bg-white p-1 text-xs">
              {[
                { d: 1, t: "۲۴ ساعت" },
                { d: 7, t: "۷ روز" },
                { d: 30, t: "۳۰ روز" },
                { d: 90, t: "۹۰ روز" },
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
          <CardBody className="h-[200px] max-h-[200px] shrink-0 overflow-hidden pt-0">
            <ChartBox height={200} className="!min-h-0 !h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={barChartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d8" vertical={false} />
                  <XAxis dataKey="day" {...axisX} />
                  <YAxis {...axisY} />
                  <Tooltip contentStyle={tooltipContentStyle} />
                  <Bar dataKey="runs" fill="#b86828" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          </CardBody>
        </Card>
        </DashboardCol>

        <DashboardCol slot="topLeft">
        <Card className="w-full">
          <CardHeader>
            <h3 className="font-bold">پرکارترین ایجنت‌ها</h3>
          </CardHeader>
          <CardBody className="space-y-2">
            {topAgents.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl bg-stone-50/60 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-stone-800">{a.name}</p>
                  <p className="text-xs text-stone-500">{deptLabel(a.department)}</p>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">
                  {a.runs}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
        </DashboardCol>

        <DashboardCol slot="bottomRight" className="flex flex-col gap-6">
        <Card className="w-full">
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-bold">رویدادهای اخیر</h3>
            <Link href="/settings" className="text-xs font-semibold text-brand-700 hover:underline">
              لاگ کامل ←
            </Link>
          </CardHeader>
          <CardBody className="space-y-3">
            {events.map((e) => (
              <div key={e.id} className="border-r-2 border-brand-500 pr-3">
                <p className="text-sm text-stone-700">{e.message}</p>
                <p className="text-xs text-stone-400">
                  <ClientDateTime iso={e.created_at} />
                </p>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="w-full">
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-bold">سلامت سامانه</h3>
            <Link href="/agents/create?step=api" className="text-xs font-semibold text-brand-700 hover:underline">
              مدیریت اتصالات
            </Link>
          </CardHeader>
          <CardBody className="space-y-2">
            {health.map((h) => (
              <div
                key={h.name}
                className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 px-4 py-2"
              >
                <span className="font-medium text-stone-800">{h.name}</span>
                <Badge variant={h.status === "healthy" ? "success" : "warning"}>
                  {h.status === "healthy" ? "سالم" : "تأخیر"} · {h.latency_ms}ms
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
        </DashboardCol>
      </DashboardFourCardGrid>
    </div>
  );
}