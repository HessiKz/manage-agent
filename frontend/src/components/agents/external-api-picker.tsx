"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchExternalApis } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AgentApiBindings } from "@/types";

type Props = {
  value: AgentApiBindings;
  onChange: (next: AgentApiBindings) => void;
};

export function ExternalApiPicker({ value, onChange }: Props) {
  const { data: services = [], isLoading } = useQuery({
    queryKey: ["external-apis"],
    queryFn: fetchExternalApis,
  });

  const activeServices = useMemo(
    () => services.filter((s) => s.is_active && s.endpoints?.length),
    [services]
  );

  function toggleService(id: string) {
    const has = value.service_ids.includes(id);
    onChange({
      ...value,
      service_ids: has
        ? value.service_ids.filter((x) => x !== id)
        : [...value.service_ids, id],
    });
  }

  function toggleEndpoint(id: string) {
    const has = value.endpoint_ids.includes(id);
    onChange({
      ...value,
      endpoint_ids: has
        ? value.endpoint_ids.filter((x) => x !== id)
        : [...value.endpoint_ids, id],
    });
  }

  if (isLoading) {
    return <p className="text-xs text-stone-500">در حال بارگذاری…</p>;
  }

  if (!activeServices.length) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-center text-xs text-stone-600">
        سرویس API فعالی نیست. از مدیریت سرویس‌های API اضافه کنید.
      </div>
    );
  }

  return (
    <div className="max-h-52 space-y-1.5 overflow-y-auto overscroll-contain pe-0.5">
      {activeServices.map((svc) => {
        const svcSelected = value.service_ids.includes(svc.id);
        const toolEndpoints = (svc.endpoints ?? []).filter(
          (ep) => ep.is_active && ep.register_as_tool
        );
        const selectedEpCount = toolEndpoints.filter((ep) =>
          value.endpoint_ids.includes(ep.id)
        ).length;

        return (
          <div
            key={svc.id}
            className={cn(
              "rounded-lg border px-2.5 py-2 transition-colors",
              svcSelected ? "border-brand-400 bg-brand-50/50" : "border-stone-200 bg-white"
            )}
          >
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={svcSelected}
                onChange={() => toggleService(svc.id)}
                className="h-3.5 w-3.5 shrink-0 accent-brand-600"
              />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800">
                {svc.name}
              </span>
              <span className="hidden max-w-[40%] truncate text-[10px] text-stone-400 sm:inline">
                {svc.base_url}
              </span>
              {toolEndpoints.length > 0 ? (
                <span className="shrink-0 text-[10px] text-stone-400">
                  {selectedEpCount}/{toolEndpoints.length}
                </span>
              ) : null}
            </label>

            {svcSelected && toolEndpoints.length > 0 ? (
              <div className="mt-1.5 space-y-0.5 border-t border-stone-100 pt-1.5">
                {toolEndpoints.map((ep) => (
                  <label
                    key={ep.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-white/80"
                  >
                    <input
                      type="checkbox"
                      checked={value.endpoint_ids.includes(ep.id)}
                      onChange={() => toggleEndpoint(ep.id)}
                      className="h-3.5 w-3.5 shrink-0 accent-brand-600"
                    />
                    <span className="font-mono text-[10px] text-brand-700">{ep.method}</span>
                    <span className="min-w-0 truncate text-stone-700">{ep.name}</span>
                    <span className="hidden min-w-0 truncate text-[10px] text-stone-400 sm:inline">
                      {ep.path}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
