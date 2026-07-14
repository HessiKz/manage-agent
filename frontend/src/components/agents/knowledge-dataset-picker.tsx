"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgeDatasets } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AgentKnowledgeBindings } from "@/types";

type Props = {
  value: AgentKnowledgeBindings;
  onChange: (next: AgentKnowledgeBindings) => void;
};

export function KnowledgeDatasetPicker({ value, onChange }: Props) {
  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ["knowledge-datasets"],
    queryFn: () => fetchKnowledgeDatasets(),
  });

  const sorted = useMemo(
    () => [...datasets].sort((a, b) => a.name.localeCompare(b.name, "fa")),
    [datasets]
  );

  function toggleDataset(id: string) {
    const has = value.dataset_ids.includes(id);
    onChange({
      dataset_ids: has
        ? value.dataset_ids.filter((x) => x !== id)
        : [...value.dataset_ids, id],
    });
  }

  if (isLoading) {
    return <p className="text-xs text-stone-500">در حال بارگذاری…</p>;
  }

  if (!sorted.length) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-center text-xs text-stone-600">
        مجموعه دانشی تعریف نشده. از مدیریت مجموعه‌های دانش اضافه کنید.
      </div>
    );
  }

  return (
    <div className="max-h-40 space-y-1 overflow-y-auto overscroll-contain pe-0.5">
      {sorted.map((ds) => {
        const selected = value.dataset_ids.includes(ds.id);
        return (
          <label
            key={ds.id}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors",
              selected ? "border-brand-400 bg-brand-50/50" : "border-stone-200 bg-white"
            )}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggleDataset(ds.id)}
              className="h-3.5 w-3.5 shrink-0 accent-brand-600"
            />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800">
              {ds.name}
            </span>
            <span className="shrink-0 text-[10px] text-stone-400">
              {ds.chunk_count} بخش
            </span>
          </label>
        );
      })}
    </div>
  );
}
