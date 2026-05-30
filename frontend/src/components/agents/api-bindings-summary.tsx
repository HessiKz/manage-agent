"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cable } from "lucide-react";
import { fetchExternalApis } from "@/lib/api";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { AgentApiBindings } from "@/types";

type Props = {
  bindings: AgentApiBindings;
};

export function ApiBindingsSummary({ bindings }: Props) {
  const { data: services = [] } = useQuery({
    queryKey: ["external-apis"],
    queryFn: fetchExternalApis,
  });

  const rows = useMemo(() => {
    const out: { id: string; label: string; detail: string }[] = [];
    for (const svc of services) {
      if (bindings.service_ids.includes(svc.id)) {
        out.push({
          id: `svc-${svc.id}`,
          label: svc.name,
          detail: svc.base_url,
        });
      }
      for (const ep of svc.endpoints ?? []) {
        if (bindings.endpoint_ids.includes(ep.id)) {
          out.push({
            id: `ep-${ep.id}`,
            label: ep.name,
            detail: `${ep.method} ${ep.path}`,
          });
        }
      }
    }
    return out;
  }, [services, bindings]);

  if (!bindings.service_ids.length && !bindings.endpoint_ids.length) {
    return <p className="text-sm text-stone-500">API خارجی متصل نشده است.</p>;
  }

  return (
    <Stagger initial={false} className="space-y-2">
      {rows.map((row) => (
        <StaggerItem key={row.id} variant="slideRight">
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
            <Cable className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="font-semibold text-stone-800">{row.label}</span>
            <span className="truncate text-xs text-stone-500">{row.detail}</span>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
