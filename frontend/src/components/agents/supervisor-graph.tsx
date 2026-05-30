"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAgentLinkGraph } from "@/lib/api";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { AgentLinkGraph } from "@/types";

type Props = {
  agentId: string;
  lastRoute?: string | null;
};

export function SupervisorGraph({ agentId, lastRoute }: Props) {
  const { data: graph } = useQuery({
    queryKey: ["agent-link-graph", agentId],
    queryFn: () => fetchAgentLinkGraph(agentId),
  });

  if (!graph?.nodes.length) {
    return <p className="text-xs text-stone-500">زیرایجنتی متصل نشده</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-stone-500">گراف سرپرست</p>
      <Stagger initial={false} className="space-y-2">
        {graph.nodes.map((n) => (
          <StaggerItem key={n.id} variant="scaleIn">
            <div
              className={`rounded-xl border px-3 py-2 text-xs ${
                lastRoute === n.slug
                  ? "border-brand-500 bg-brand-50"
                  : "border-stone-200 bg-white"
              }`}
            >
              <span className="font-bold text-stone-800">{n.name}</span>
              <span className="mr-2 text-stone-400">({n.kind})</span>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
      {graph.edges.length > 0 && (
        <p className="text-xs text-stone-400">
          {graph.edges.length} اتصال فعال
        </p>
      )}
    </div>
  );
}

/** Compact preview for wizard */
export function SupervisorGraphPreview({ graph }: { graph?: AgentLinkGraph | null }) {
  if (!graph?.nodes.length) return null;
  return (
    <Stagger initial={false} className="flex flex-wrap gap-2">
      {graph.nodes.slice(1).map((n) => (
        <StaggerItem key={n.id} variant="scaleIn">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">
            {n.name}
          </span>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
