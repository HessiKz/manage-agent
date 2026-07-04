"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cable, Database } from "lucide-react";
import { fetchExternalApis, fetchKnowledgeDatasets } from "@/lib/api";
import type { AgentApiBindings, AgentKnowledgeBindings } from "@/types";

type Props = {
  knowledgeBindings: AgentKnowledgeBindings;
  onKnowledgeChange: (next: AgentKnowledgeBindings) => void;
  apiBindings: AgentApiBindings;
  onApiChange: (next: AgentApiBindings) => void;
};

function apiOptionKey(type: "service" | "endpoint", id: string) {
  return `${type}:${id}`;
}

function parseApiOptionKey(key: string): { type: "service" | "endpoint"; id: string } | null {
  const [type, id] = key.split(":");
  if ((type === "service" || type === "endpoint") && id) return { type, id };
  return null;
}

export function KnowledgeSourcePicker({
  knowledgeBindings,
  onKnowledgeChange,
  apiBindings,
  onApiChange,
}: Props) {
  const { data: datasets = [], isLoading: loadingDatasets } = useQuery({
    queryKey: ["knowledge-datasets"],
    queryFn: () => fetchKnowledgeDatasets(),
  });

  const { data: services = [], isLoading: loadingApis } = useQuery({
    queryKey: ["external-apis"],
    queryFn: fetchExternalApis,
  });

  const sortedDatasets = useMemo(
    () => [...datasets].sort((a, b) => a.name.localeCompare(b.name, "fa")),
    [datasets]
  );

  const apiOptions = useMemo(() => {
    const items: { key: string; label: string; group: string }[] = [];
    for (const svc of services.filter((s) => s.is_active)) {
      items.push({
        key: apiOptionKey("service", svc.id),
        label: svc.name,
        group: "سرویس API",
      });
      for (const ep of svc.endpoints ?? []) {
        if (!ep.is_active || !ep.register_as_tool) continue;
        items.push({
          key: apiOptionKey("endpoint", ep.id),
          label: `${ep.name} (${ep.method} ${ep.path})`,
          group: svc.name,
        });
      }
    }
    return items;
  }, [services]);

  const selectedApiKeys = useMemo(
    () => [
      ...apiBindings.service_ids.map((id) => apiOptionKey("service", id)),
      ...apiBindings.endpoint_ids.map((id) => apiOptionKey("endpoint", id)),
    ],
    [apiBindings]
  );

  function onKnowledgeSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
    onKnowledgeChange({ dataset_ids: ids });
  }

  function onApiSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const keys = Array.from(e.target.selectedOptions).map((o) => o.value);
    const service_ids: string[] = [];
    const endpoint_ids: string[] = [];
    for (const key of keys) {
      const parsed = parseApiOptionKey(key);
      if (!parsed) continue;
      if (parsed.type === "service") service_ids.push(parsed.id);
      else endpoint_ids.push(parsed.id);
    }
    onApiChange({ service_ids, endpoint_ids });
  }

  const selectClass =
    "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div className="space-y-5">
      <p className="text-sm text-stone-600">
        منابع را از پایگاه مرکزی انتخاب کنید (اختیاری — پیش‌فرض خالی است).
      </p>
      <p className="text-xs text-stone-500">
        <Link href="/admin/knowledge" className="font-medium text-brand-700 hover:underline">
          مدیریت پایگاه دانش ←
        </Link>
      </p>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-stone-800">
          <Database className="h-4 w-4 text-brand-600" />
          منابع دانش
        </label>
        {loadingDatasets ? (
          <p className="text-sm text-stone-500">در حال بارگذاری…</p>
        ) : !sortedDatasets.length ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            هنوز مجموعه‌ای تعریف نشده.
          </p>
        ) : (
          <>
            <select
              multiple
              value={knowledgeBindings.dataset_ids}
              onChange={onKnowledgeSelect}
              className={selectClass}
              size={Math.min(6, Math.max(3, sortedDatasets.length))}
            >
              {sortedDatasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name}
                  {ds.chunk_count ? ` · ${ds.chunk_count} بخش` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-stone-500">
              {knowledgeBindings.dataset_ids.length
                ? `${knowledgeBindings.dataset_ids.length} مجموعه انتخاب شده`
                : "هیچ مجموعه‌ای انتخاب نشده"}
              {" · "}برای انتخاب چند مورد، Ctrl/Cmd را نگه دارید.
            </p>
          </>
        )}
      </div>

      <div className="space-y-2 border-t border-stone-100 pt-4">
        <label className="flex items-center gap-2 text-sm font-bold text-stone-800">
          <Cable className="h-4 w-4 text-brand-600" />
          API و ابزار
        </label>
        {loadingApis ? (
          <p className="text-sm text-stone-500">در حال بارگذاری…</p>
        ) : !apiOptions.length ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            هنوز API یا ابزاری تعریف نشده.
          </p>
        ) : (
          <>
            <select
              multiple
              value={selectedApiKeys}
              onChange={onApiSelect}
              className={selectClass}
              size={Math.min(6, Math.max(3, apiOptions.length))}
            >
              {apiOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.group} — {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-stone-500">
              {selectedApiKeys.length
                ? `${selectedApiKeys.length} مورد انتخاب شده`
                : "هیچ API یا ابزاری انتخاب نشده"}
              {" · "}برای انتخاب چند مورد، Ctrl/Cmd را نگه دارید.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
