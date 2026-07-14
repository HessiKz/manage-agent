"use client";

import { useFeatureFlag } from "@/lib/feature-flags";
import { Input } from "@/components/ui/input";

export interface AgentRuntimeConfig {
  execution_backend: "native" | "sandbox";
  timeout_seconds: number;
  memory_limit_mb: number;
}

export const DEFAULT_RUNTIME: AgentRuntimeConfig = {
  execution_backend: "native",
  timeout_seconds: 900,
  memory_limit_mb: 2048,
};

export function RuntimeBackendSelector({
  value,
  onChange,
}: {
  value: AgentRuntimeConfig;
  onChange: (next: AgentRuntimeConfig) => void;
}) {
  const sandboxEnabled = useFeatureFlag("sandbox_execution_enabled");

  return (
    <div className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold">محیط اجرا</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...value, execution_backend: "native" })}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              value.execution_backend === "native"
                ? "bg-brand-600 text-white"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            بومی (native)
          </button>
          <button
            type="button"
            disabled={!sandboxEnabled}
            onClick={() => onChange({ ...value, execution_backend: "sandbox" })}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              !sandboxEnabled
                ? "cursor-not-allowed bg-stone-100 text-stone-300"
                : value.execution_backend === "sandbox"
                  ? "bg-brand-600 text-white"
                  : "bg-stone-100 text-stone-600"
            }`}
            title={sandboxEnabled ? "" : "صندوق شنی غیرفعال است"}
          >
            جعبه‌ای (sandbox)
          </button>
        </div>
        {!sandboxEnabled && (
          <span className="text-xs text-stone-400">صندوق شنی در حال حاضر غیرفعال است.</span>
        )}
      </div>

      {value.execution_backend === "sandbox" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs">مهلت (ثانیه)</label>
            <Input
              type="number"
              min={60}
              max={3600}
              value={value.timeout_seconds}
              onChange={(e) =>
                onChange({ ...value, timeout_seconds: Number(e.target.value) || 900 })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs">حافظه (MB)</label>
            <Input
              type="number"
              min={256}
              max={8192}
              step={256}
              value={value.memory_limit_mb}
              onChange={(e) =>
                onChange({ ...value, memory_limit_mb: Number(e.target.value) || 2048 })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
