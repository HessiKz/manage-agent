"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentCardSkeleton } from "@/components/ui/skeleton";
import { deleteAgent, fetchAllAgents, updateAgent } from "@/lib/api";
import { appAlert, appConfirm } from "@/lib/app-dialog";
import { handleApiError } from "@/lib/api-error-handler";
import type { Agent } from "@/types";

export default function AdminAgentsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-agents"],
    queryFn: () => fetchAllAgents({ page_size: 100 }),
  });

  const agents = data?.items ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-agents"] }),
      qc.invalidateQueries({ queryKey: ["agents"] }),
      qc.invalidateQueries({ queryKey: ["overview"] }),
      qc.invalidateQueries({ queryKey: ["departments"] }),
      qc.invalidateQueries({ queryKey: ["sidebar-counts"] }),
    ]);
  }

  async function handleToggleActive(agent: Agent) {
    const isActive = agent.status === "active";
    const ok = await appConfirm({
      title: isActive ? "غیرفعال کردن ایجنت" : "فعال کردن ایجنت",
      message: isActive
        ? `ایجنت «${agent.name}» غیرفعال شود؟ کاربران دیگر نمی‌توانند آن را فراخوانی کنند.`
        : `ایجنت «${agent.name}» دوباره فعال شود؟`,
      confirmLabel: isActive ? "غیرفعال" : "فعال",
      cancelLabel: "انصراف",
      tone: isActive ? "default" : "default",
    });
    if (!ok) return;
    setBusyId(agent.id);
    try {
      await updateAgent(agent.id, {
        api_bindings: { service_ids: [], endpoint_ids: [] },
        knowledge_bindings: { dataset_ids: [] },
        status: isActive ? "paused" : "active",
      });
      await invalidateAll();
    } catch (e) {
      const apiErr = handleApiError(e, { event: "admin.agent.toggle" });
      await appAlert({
        title: "خطا",
        message: apiErr.message,
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
      await invalidateAll();
    } catch (e) {
      const apiErr = handleApiError(e, { event: "admin.agent.delete" });
      await appAlert({
        title: "خطا",
        message: apiErr.message,
        tone: "danger",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">مدیریت ایجنت‌ها</h1>
          <p className="mt-1 text-sm text-stone-500">
            {agents.length} ایجنت — فعال/غیرفعال یا حذف کنید.
          </p>
        </div>
        <Link
          href="/agents/create"
          className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-700 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
          ایجنت جدید
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <AgentCardSkeleton key={i} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 px-6 py-12 text-center text-sm text-stone-600">
          هنوز ایجنتی ساخته نشده. روی «ایجنت جدید» بزنید.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              editHref={`/agents/create?slug=${encodeURIComponent(agent.slug)}&mode=edit`}
              manage={{
                busy: busyId === agent.id,
                onToggleActive: handleToggleActive,
                onDelete: handleDelete,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
