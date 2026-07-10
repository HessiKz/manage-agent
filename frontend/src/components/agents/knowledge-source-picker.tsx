"use client";

import { Database, Cable } from "lucide-react";
import { KnowledgeDatasetPicker } from "@/components/agents/knowledge-dataset-picker";
import { ExternalApiPicker } from "@/components/agents/external-api-picker";
import type { AgentApiBindings, AgentKnowledgeBindings } from "@/types";

type Props = {
  knowledgeBindings: AgentKnowledgeBindings;
  onKnowledgeChange: (next: AgentKnowledgeBindings) => void;
  apiBindings: AgentApiBindings;
  onApiChange: (next: AgentApiBindings) => void;
};

export function KnowledgeSourcePicker({
  knowledgeBindings,
  onKnowledgeChange,
  apiBindings,
  onApiChange,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-brand-600" />
          <p className="text-sm font-bold text-stone-800">منابع دانش</p>
        </div>
        <KnowledgeDatasetPicker
          value={knowledgeBindings}
          onChange={onKnowledgeChange}
        />
      </div>

      <div className="space-y-3 border-t border-stone-100 pt-5">
        <div className="flex items-center gap-2">
          <Cable className="h-4 w-4 text-brand-600" />
          <p className="text-sm font-bold text-stone-800">API و ابزار</p>
        </div>
        <ExternalApiPicker
          value={apiBindings}
          onChange={onApiChange}
        />
      </div>
    </div>
  );
}
