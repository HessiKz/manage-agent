"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentCardSkeleton } from "@/components/ui/skeleton";
import { fetchAllAgents } from "@/lib/api";

export default function AdminAgentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-agents"],
    queryFn: () => fetchAllAgents({ page_size: 100 }),
  });

  const agents = data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">مدیریت ایجنت‌ها</h1>
        </div>
        <Link
          href="/agents/create"
          className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          ایجنت جدید
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <AgentCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              editHref={`/agents/create?slug=${encodeURIComponent(agent.slug)}&mode=edit`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
