"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bot, Sparkles } from "lucide-react";
import { AgentCard, StatCard } from "@/components/agents/agent-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AgentCardSkeleton, StatCardSkeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/input";
import { fetchAgents, fetchOverview, fetchTopAgents, routeAgent } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { deptLabel } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { ClientDate } from "@/components/ui/client-date";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-stone-500">در حال بارگذاری…</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const user = useAuthStore((s) => s.user);
  const searchParams = useSearchParams();
  const deptFilter = searchParams.get("dept") ?? undefined;
  const [prompt, setPrompt] = useState("");
  const [routing, setRouting] = useState(false);

  async function handleRoute() {
    if (!prompt.trim()) return;
    setRouting(true);
    try {
      const result = await routeAgent(prompt);
      if (result.agent?.slug) {
        window.location.href = `/agents/${result.agent.slug}?q=${encodeURIComponent(prompt)}`;
      }
    } finally {
      setRouting(false);
    }
  }

  function onPromptKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleRoute();
    }
  }

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
  });
  const { data: agentsPage, isLoading: agentsLoading } = useQuery({
    queryKey: ["agents", deptFilter],
    queryFn: () =>
      fetchAgents({ department: deptFilter, page_size: 50, status: "active" }),
  });
  const { data: topAgents = [] } = useQuery({ queryKey: ["top-agents"], queryFn: fetchTopAgents });

  const runMap = useMemo(() => {
    const m: Record<string, number> = {};
    topAgents.forEach((a) => {
      m[a.id] = a.runs;
    });
    return m;
  }, [topAgents]);

  const agents = agentsPage?.items ?? [];

  return (
    <Stagger
      initial={false}
      className="space-y-6 p-6"
      delayChildren={0.03}
      staggerChildren={0.05}
    >
      <StaggerItem variant="slideUp">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            سلام {user?.full_name?.split(" ")[0] ?? "کاربر"}
          </h1>
          <p className="mt-1 text-stone-600">
            ۳ اقدام در انتظار شماست · <ClientDate />
          </p>
        </div>
      </StaggerItem>

      <StaggerItem variant="scaleIn">
      <div className="glass-panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              AI
            </div>
            یک خواسته بنویس — مناسب‌ترین ایجنت پیشنهاد می‌شود
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="chip-btn bg-stone-100 text-stone-700 hover:bg-brand-50 hover:text-brand-800"
            >
              شبکه ۲
            </button>
            <button
              type="button"
              className="chip-btn bg-stone-100 text-stone-700 hover:bg-brand-50 hover:text-brand-800"
            >
              فیلتر
            </button>
          </div>
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onPromptKeyDown}
          placeholder="«حقوق این ماه را آماده کن» یا «مغایرت حساب ۱ را بگیر»"
          className="resize-none bg-white/80 px-4 py-3"
          rows={2}
          aria-label="توضیح درخواست برای یافتن ایجنت"
        />
        <p className="mt-2 text-[11px] text-stone-500">
          Ctrl+Enter برای ارسال سریع
        </p>

        <Stagger delayChildren={0.02} staggerChildren={0.04} className="mt-3 flex flex-wrap gap-2">
          {[
            "اجرای حقوق بهمن",
            "گزارش هفتگی فروش",
            "مغایرت‌های جدید بانک",
            "تحلیل اضافه‌کار تولید",
          ].map((t) => (
            <StaggerItem key={t} variant="scaleIn">
              <button
                type="button"
                onClick={() => setPrompt(t)}
                className="chip-btn bg-brand-50 text-brand-800 hover:bg-brand-100"
              >
                {t}
              </button>
            </StaggerItem>
          ))}
        </Stagger>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleRoute} disabled={!prompt.trim() || routing}>
            <Sparkles className="h-4 w-4" />
            {routing ? "در حال یافتن ایجنت…" : "اقدام پیشنهادی"}
          </Button>
        </div>
      </div>
      </StaggerItem>

      {overviewLoading && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      )}

      {overview && !overviewLoading && (
        <Stagger delayChildren={0.04} staggerChildren={0.05} className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StaggerItem variant="scaleIn">
            <StatCard
              label="آوردی صرفه‌جویی"
              value="۱٬۲۴۸"
              hint="↗ ۱۲٫۴٪+"
              chartVariant="savings"
            />
          </StaggerItem>
          <StaggerItem variant="scaleIn">
            <StatCard label="ساعت" value="۸۴" hint="↗ این ماه" chartVariant="hours" />
          </StaggerItem>
          <StaggerItem variant="scaleIn">
            <StatCard
              label="هشدارها"
              value="۳"
              hint="باید بازبینی شود"
              chartVariant="alerts"
            />
          </StaggerItem>
          <StaggerItem variant="scaleIn">
            <StatCard
              label="میانگین دقت"
              value="۹۸٫۲٪"
              hint="↗ ۰٫۴٪+"
              chartVariant="accuracy"
            />
          </StaggerItem>
        </Stagger>
      )}

      <StaggerItem variant="slideUp">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              {deptFilter ? `ایجنت‌های ${deptLabel(deptFilter)}` : "ایجنت‌های من"}
            </h2>
            <span className="text-sm text-stone-500">{agents.length} ایجنت</span>
          </div>
          {agentsLoading && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <AgentCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!agentsLoading && agents.length === 0 && (
            <EmptyState
              icon={Bot}
              title="ایجنتی یافت نشد"
              description={
                deptFilter
                  ? `در دپارتمان ${deptLabel(deptFilter)} ایجنتی ثبت نشده است.`
                  : "هنوز ایجنتی به فضای کار شما اختصاص داده نشده است."
              }
            />
          )}

          {!agentsLoading && agents.length > 0 && (
            <Stagger
              delayChildren={0.03}
              staggerChildren={0.05}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {agents.map((agent) => (
                <StaggerItem key={agent.id} variant="slideUp">
                  <AgentCard agent={agent} runs={runMap[agent.id] ?? 0} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </StaggerItem>
    </Stagger>
  );
}
