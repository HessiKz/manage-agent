"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type FeatureFlags = {
  run_state_v1: boolean;
  precision_routing_v1: boolean;
  graduated_autonomy_v1: boolean;
  skill_library_v1: boolean;
  failure_ledger_v1: boolean;
  sandbox_execution_enabled: boolean;
  parallel_supervisor_v1: boolean;
  sandbox_promotion_hints: boolean;
};

const DEFAULT_FLAGS: FeatureFlags = {
  run_state_v1: true,
  precision_routing_v1: true,
  graduated_autonomy_v1: false,
  skill_library_v1: true,
  failure_ledger_v1: true,
  sandbox_execution_enabled: false,
  parallel_supervisor_v1: false,
  sandbox_promotion_hints: false,
};

let cached: FeatureFlags | null = null;

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  try {
    const { data } = await api.get<Partial<FeatureFlags>>("/platform/feature-flags");
    cached = { ...DEFAULT_FLAGS, ...data };
    return cached;
  } catch {
    return cached ?? DEFAULT_FLAGS;
  }
}

export function useFeatureFlag<K extends keyof FeatureFlags>(key: K): boolean {
  const { data } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFeatureFlags,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return data?.[key] ?? DEFAULT_FLAGS[key];
}

export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFeatureFlags,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return data ?? DEFAULT_FLAGS;
}
