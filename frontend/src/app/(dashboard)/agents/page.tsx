"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { fetchAgents } from "@/lib/api";
import { AgentCard } from "@/components/agents/agent-card";
import { EmptyState } from "@/components/ui/empty-state";
import { AgentCardSkeleton } from "@/components/ui/skeleton";
import { deptLabel } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

function AgentsListContent() {
  const params = useSearchParams();
  const dept = params.get("dept");

  const { data, isLoading } = useQuery({
    queryKey: ["agents", dept],
    queryFn: () =>
      fetchAgents({
        department: dept ?? undefined,
        page_size: 100,
        status: "active",
      }),
  });

  const agents = data?.items ?? [];

  const title = useMemo(
    () => (dept ? `ایجنت‌های ${deptLabel(dept)}` : "همه ایجنت‌ها"),
    [dept]
  );

  return (
    <Stagger initial={false} className="space-y-6" delayChildren={0.03} staggerChildren={0.05}>
      <StaggerItem variant="slideDown">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
            <p className="text-stone-500">{agents.length} ایجنت فعال</p>
          </div>
        </div>
      </StaggerItem>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <AgentCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!isLoading && agents.length > 0 && (
        <Stagger
          delayChildren={0.04}
          staggerChildren={0.05}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {agents.map((a) => (
            <StaggerItem key={a.id} variant="scaleIn">
              <AgentCard agent={a} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {!isLoading && agents.length === 0 && (
        <StaggerItem variant="fadeIn">
          <EmptyState
            icon={Bot}
            title="ایجنتی در این بخش یافت نشد"
            description={
              dept
                ? `فیلتر دپارتمان «${deptLabel(dept)}» نتیجه‌ای نداشت. فیلتر را بردارید یا ایجنت جدید بسازید.`
                : "هنوز ایجنت فعالی ثبت نشده است. از «ایجنت جدید» یکی بسازید."
            }
          />
        </StaggerItem>
      )}
    </Stagger>
  );
}

export default function AgentsListPage() {
  return (
    <div className="page-padding space-y-6">
      <Suspense fallback={<p className="text-stone-400">بارگذاری ایجنت‌ها…</p>}>
        <AgentsListContent />
      </Suspense>
    </div>
  );
}
