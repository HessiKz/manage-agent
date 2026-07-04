"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { fetchKnowledgeDatasets } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
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
    return <p className="text-sm text-stone-500">در حال بارگذاری مجموعه‌های دانش…</p>;
  }

  if (!sorted.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-600">
        هنوز مجموعه دانش سازمانی تعریف نشده. در بخش «مدیریت مجموعه‌های دانش» بالا یک مجموعه
        بسازید و محتوا را در آن درج کنید.
      </div>
    );
  }

  return (
    <Stagger initial={false} className="space-y-3">
      {sorted.map((ds) => {
        const selected = value.dataset_ids.includes(ds.id);
        return (
          <StaggerItem key={ds.id} variant="scaleIn">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors duration-150",
                selected ? "border-brand-500 bg-brand-50/40" : "border-stone-200 bg-white"
              )}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleDataset(ds.id)}
                className="mt-1 h-4 w-4 accent-brand-600"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Database className="h-4 w-4 text-brand-600" />
                  <p className="font-bold text-stone-900">{ds.name}</p>
                  <span className="text-xs text-stone-500">{ds.slug}</span>
                </div>
                {ds.description ? (
                  <p className="mt-1 text-xs text-stone-500">{ds.description}</p>
                ) : null}
                <p className="mt-2 text-xs text-stone-400">
                  {ds.chunk_count} بخش دانش
                  {ds.department ? ` · ${ds.department}` : ""}
                </p>
              </div>
            </label>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
