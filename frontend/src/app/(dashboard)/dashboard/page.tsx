"use client";

import { Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { AgentCard } from "@/components/agents/agent-card";
import { DashboardInsightsPanel } from "@/components/dashboard/dashboard-insights-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { AgentCardSkeleton } from "@/components/ui/skeleton";
import {
  fetchOverview,
  fetchPlatformHrSavings,
  fetchTopAgents,
} from "@/lib/api";
import { POPULAR_AGENT_LIMIT, pickPopularAgents } from "@/lib/top-agent-card";
import { useAuthStore } from "@/stores/auth-store";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { ClientDate } from "@/components/ui/client-date";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="page-padding text-stone-500">در حال بارگذاری…</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const user = useAuthStore((s) => s.user);

  const { data: overview } = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
  });
  const { data: hrSavings } = useQuery({
    queryKey: ["platform-hr-savings"],
    queryFn: fetchPlatformHrSavings,
  });
  const { data: topAgents = [], isLoading: topLoading } = useQuery({
    queryKey: ["top-agents", POPULAR_AGENT_LIMIT],
    queryFn: () => fetchTopAgents(POPULAR_AGENT_LIMIT),
  });

  const popularAgents = useMemo(() => pickPopularAgents(topAgents), [topAgents]);

  const subtitle = hrSavings?.uses_live_activity
    ? `صرفه‌جویی ${hrSavings.money_saved_label} · ${hrSavings.time_saved_label} زمان`
    : overview
      ? `${overview.agents.active} ایجنت فعال · ${overview.runs.total} اجرا`
      : "نمای کلی فضای کار";

  return (
    <Stagger
      initial={false}
      className="page-padding space-y-6"
      delayChildren={0.03}
      staggerChildren={0.05}
    >
      <StaggerItem variant="slideUp">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            سلام {user?.full_name?.split(" ")[0] ?? "کاربر"}
          </h1>
          <p className="mt-1 text-stone-600">
            {subtitle} · <ClientDate />
          </p>
        </div>
      </StaggerItem>

      <StaggerItem variant="scaleIn">
        <DashboardInsightsPanel topAgents={topAgents} overview={overview} />
      </StaggerItem>

      <StaggerItem variant="slideUp">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">ایجنت‌های پرکاربرد</h2>
            <span className="text-sm text-stone-500">بر اساس تعداد اجرا</span>
          </div>
          {topLoading && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: POPULAR_AGENT_LIMIT }).map((_, i) => (
                <AgentCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!topLoading && popularAgents.length === 0 && (
            <EmptyState
              icon={Bot}
              title="ایجنتی یافت نشد"
              description="هنوز ایجنتی در فضای کار ثبت نشده یا اجرایی انجام نشده است."
            />
          )}

          {!topLoading && popularAgents.length > 0 && (
            <Stagger
              delayChildren={0.03}
              staggerChildren={0.05}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              {popularAgents.map(({ agent, runs, isNew }) => (
                <StaggerItem key={agent.id} variant="slideUp">
                  <AgentCard agent={agent} runs={runs} isNew={isNew} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </StaggerItem>
    </Stagger>
  );
}
