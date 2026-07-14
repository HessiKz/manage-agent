"use client";

import type { ReactNode } from "react";
import { Cable, ChevronDown, Database } from "lucide-react";
import { KnowledgeDatasetPicker } from "@/components/agents/knowledge-dataset-picker";
import { ExternalApiPicker } from "@/components/agents/external-api-picker";
import type { AgentApiBindings, AgentKnowledgeBindings } from "@/types";

type Props = {
  knowledgeBindings: AgentKnowledgeBindings;
  onKnowledgeChange: (next: AgentKnowledgeBindings) => void;
  apiBindings: AgentApiBindings;
  onApiChange: (next: AgentApiBindings) => void;
};

function SectionShell({
  icon,
  title,
  countLabel,
  children,
  defaultOpen = false,
}: {
  icon: ReactNode;
  title: string;
  countLabel: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen || undefined}
      className="group rounded-xl border border-stone-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <span className="text-brand-600">{icon}</span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-stone-800">{title}</span>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
          {countLabel}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <div className="border-t border-stone-100 px-3 py-2.5">{children}</div>
    </details>
  );
}

export function KnowledgeSourcePicker({
  knowledgeBindings,
  onKnowledgeChange,
  apiBindings,
  onApiChange,
}: Props) {
  const knowledgeCount = knowledgeBindings.dataset_ids?.length ?? 0;
  const apiCount =
    (apiBindings.service_ids?.length ?? 0) + (apiBindings.endpoint_ids?.length ?? 0);

  return (
    <div className="space-y-2">
      <SectionShell
        icon={<Database className="h-3.5 w-3.5" />}
        title="منابع دانش"
        countLabel={knowledgeCount ? `${knowledgeCount} انتخاب` : "اختیاری"}
        defaultOpen={knowledgeCount > 0}
      >
        <KnowledgeDatasetPicker value={knowledgeBindings} onChange={onKnowledgeChange} />
      </SectionShell>

      <SectionShell
        icon={<Cable className="h-3.5 w-3.5" />}
        title="API و ابزار"
        countLabel={apiCount ? `${apiCount} انتخاب` : "اختیاری"}
        defaultOpen={apiCount > 0}
      >
        <ExternalApiPicker value={apiBindings} onChange={onApiChange} />
      </SectionShell>
    </div>
  );
}
