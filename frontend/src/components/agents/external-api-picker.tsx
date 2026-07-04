"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cable } from "lucide-react";
import { fetchExternalApis } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
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
    return <p className="text-sm text-stone-500">در حال بارگذاری یکپارچه‌سازی‌ها…</p>;
  }

  if (!activeServices.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-600">
        هنوز سرویس API فعالی نیست. در بخش «مدیریت سرویس‌های API» بالا یک سرویس و اندپوینت اضافه
        کنید.
      </div>
    );
  }

  return (
    <Stagger initial={false} className="space-y-4">
      {activeServices.map((svc) => {
        const svcSelected = value.service_ids.includes(svc.id);
        const toolEndpoints = (svc.endpoints ?? []).filter(
          (ep) => ep.is_active && ep.register_as_tool
        );
        return (
          <StaggerItem key={svc.id} variant="scaleIn">
            <div
              className={cn(
                "rounded-2xl border p-4 transition-colors duration-150",
                svcSelected ? "border-brand-500 bg-brand-50/40" : "border-stone-200 bg-white"
              )}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={svcSelected}
                  onChange={() => toggleService(svc.id)}
                  className="mt-1 h-4 w-4 accent-brand-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Cable className="h-4 w-4 text-brand-600" />
                    <p className="font-bold text-stone-900">{svc.name}</p>
                    <span className="text-xs text-stone-500">{svc.base_url}</span>
                  </div>
                  {svc.description ? (
                    <p className="mt-1 text-xs text-stone-500">{svc.description}</p>
                  ) : null}
                </div>
              </label>
              {toolEndpoints.length > 0 ? (
                <div className="mt-3 space-y-2 border-t border-stone-100 pt-3 pr-7">
                  <p className="text-xs font-semibold text-stone-600">endpointها (ابزار)</p>
                  {toolEndpoints.map((ep) => (
                    <label
                      key={ep.id}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-stone-100 bg-white px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-mono text-xs text-brand-700">{ep.method}</span>{" "}
                        {ep.name}{" "}
                        <span className="text-stone-400">{ep.path}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={value.endpoint_ids.includes(ep.id)}
                        onChange={() => toggleEndpoint(ep.id)}
                        className="h-4 w-4 accent-brand-600"
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-2 pr-7 text-xs text-stone-500">
                  endpoint ابزار فعالی برای این سرویس نیست.
                </p>
              )}
            </div>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
