"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { fetchKnowledgeDatasets } from "@/lib/api";
import { parseKnowledgeBindings } from "@/lib/agent-knowledge-bindings";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { Agent } from "@/types";

type Props = {
  agent: Agent;
};

export function BoundKnowledgeDatasetsSummary({ agent }: Props) {
  const bindings = parseKnowledgeBindings(agent.config_json);
  const { data: datasets = [] } = useQuery({
    queryKey: ["knowledge-datasets"],
    queryFn: () => fetchKnowledgeDatasets(),
  });

  const rows = useMemo(
    () => datasets.filter((ds) => bindings.dataset_ids.includes(ds.id)),
    [datasets, bindings.dataset_ids]
  );

  if (!bindings.dataset_ids.length) {
    return (
      <p className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-400">
        هیچ مجموعه دانش سازمانی به این ایجنت متصل نیست.
      </p>
    );
  }

  return (
    <Stagger initial={false} className="space-y-2">
      {rows.map((ds) => (
        <StaggerItem key={ds.id} variant="slideRight">
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
            <Database className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="font-semibold text-stone-800">{ds.name}</span>
            <span className="truncate text-xs text-stone-500">
              {ds.chunk_count} بخش · {ds.slug}
            </span>
          </div>
        </StaggerItem>
      ))}
      {rows.length < bindings.dataset_ids.length && (
        <p className="text-xs text-stone-400">
          {bindings.dataset_ids.length - rows.length} مجموعه دیگر در سیستم یافت نشد.
        </p>
      )}
    </Stagger>
  );
}
