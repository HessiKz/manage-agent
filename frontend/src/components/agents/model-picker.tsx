"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAvailableModels } from "@/lib/api";
import { WizardField } from "@/components/agents/wizard-field";
import { FIELD_HELP } from "@/lib/wizard-step-help";

type Props = {
  value: string;
  onChange: (model: string) => void;
};

export function ModelPicker({ value, onChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-models"],
    queryFn: fetchAvailableModels,
  });

  const models = data?.models ?? [value || "claude-opus-4-8"];

  return (
    <WizardField label={FIELD_HELP.model.label} hint={FIELD_HELP.model.hint}>
      <select
        data-ma-support="wizard-model"
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-mono"
        value={value}
        disabled={isLoading}
        onChange={(e) => onChange(e.target.value)}
      >
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </WizardField>
  );
}
