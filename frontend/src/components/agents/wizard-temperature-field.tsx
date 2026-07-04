"use client";

import { WizardField } from "@/components/agents/wizard-field";
import { FIELD_HELP } from "@/lib/wizard-step-help";

const PRESETS: { label: string; value: number }[] = [
  { label: "دقیق", value: 0.2 },
  { label: "متعادل", value: 0.5 },
  { label: "خلاق", value: 0.8 },
];

function describeLevel(value: number): string {
  if (value <= 0.3) return "پاسخ‌ها دقیق و یکسان‌تر";
  if (value <= 0.6) return "تعادل بین دقت و تنوع";
  return "پاسخ‌ها متنوع‌تر و آزادتر";
}

type Props = {
  value: number;
  onChange: (value: number) => void;
};

export function WizardTemperatureField({ value, onChange }: Props) {
  const clamped = Math.min(2, Math.max(0, value));

  return (
    <WizardField
      label={FIELD_HELP.temperature.label}
      hint={FIELD_HELP.temperature.hint}
      htmlFor="wizard-temperature"
    >
      <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-stone-800" aria-live="polite">
            {clamped.toFixed(1)} — {describeLevel(clamped)}
          </span>
        </div>
        <input
          id="wizard-temperature"
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={Math.min(1, clamped)}
          onChange={(e) => onChange(Number(e.target.value))}
          data-ma-support="wizard-temperature"
          className="h-2 w-full cursor-pointer accent-brand-600"
        />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              data-ma-support={`wizard-temperature-${preset.label}`}
              onClick={() => onChange(preset.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                Math.abs(clamped - preset.value) < 0.05
                  ? "border-brand-500 bg-brand-50 text-brand-800"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
              }`}
            >
              {preset.label} ({preset.value.toFixed(1)})
            </button>
          ))}
        </div>
      </div>
    </WizardField>
  );
}
