"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bot, Plus, Sparkles, ArrowLeft } from "lucide-react";
import { fetchAgents } from "@/lib/api";
import { AgentCard } from "@/components/agents/agent-card";
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
              <p className="text-stone-500">{agents.length} ایجنت فعال</p>
            </div>
          </div>

          <Link
            href="/agents/create"
            className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-700 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
            ایجنت جدید
          </Link>
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
        <StaggerItem variant="scaleIn">
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-brand-200 bg-gradient-to-br from-brand-50/60 via-white to-brand-50/40 px-8 py-14 text-center shadow-sm">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-100/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-brand-200/30 blur-3xl" />

            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
              <Sparkles className="h-9 w-9" />
            </div>

            <h2 className="relative mt-6 text-xl font-bold text-stone-900">
              هنوز ایجنتی نساخته‌اید
            </h2>
            <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-500">
              با چند کلیک، یک ایجنت هوشمند برای دپارتمان خود بسازید — دستورالعمل، دانش اختصاصی
              و ابزارها را تعریف کنید و در لحظه پاسخ‌گویی بگیرید.
            </p>

            <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/agents/create"
                className="group inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
              >
                <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                ساخت ایجنت جدید
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-600 transition-colors duration-200 hover:border-brand-300 hover:text-brand-700"
              >
                <ArrowLeft className="h-4 w-4" />
                بازگشت به داشبورد
              </Link>
            </div>
          </div>
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
