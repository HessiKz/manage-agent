"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getInputProperties } from "@/lib/action-inputs";
import { runAgentAction } from "@/lib/api";
import { handleApiError } from "@/lib/api-error-handler";
import { appConfirm } from "@/lib/app-dialog";
import type { Agent, AgentAction } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

function defaultVarsForAction(action: AgentAction | null): Record<string, string> {
  if (!action) return {};
  const props = getInputProperties(action.input_schema);
  const out: Record<string, string> = {};
  for (const [key, schema] of Object.entries(props)) {
    if (schema?.default !== undefined && schema?.default !== null) {
      out[key] = String(schema.default);
    }
  }
  return out;
}

function mergeActionVars(
  action: AgentAction,
  vars: Record<string, string>
): Record<string, string> {
  const merged = { ...defaultVarsForAction(action), ...vars };
  const props = getInputProperties(action.input_schema);
  for (const [key, schema] of Object.entries(props)) {
    if (!String(merged[key] ?? "").trim() && schema?.default !== undefined && schema?.default !== null) {
      merged[key] = String(schema.default);
    }
  }
  return merged;
}

type Props = {
  agent: Agent;
  actions: AgentAction[];
  onResult?: (output: string) => void;
  onRunStart?: (userLine: string) => void;
  onChatExchange?: (userPrompt: string, assistantOutput: string) => void;
};

export function WorkerActionGrid({
  agent,
  actions,
  onResult,
  onRunStart,
  onChatExchange,
}: Props) {
  const [selectedSlug, setSelectedSlug] = useState(actions[0]?.slug ?? "");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = actions.find((a) => a.slug === selectedSlug) ?? null;

  useEffect(() => {
    if (actions.length && !actions.some((a) => a.slug === selectedSlug)) {
      setSelectedSlug(actions[0].slug);
    }
  }, [actions, selectedSlug]);

  useEffect(() => {
    setVars(defaultVarsForAction(active));
    setError(null);
  }, [selectedSlug, active?.slug, active?.input_schema]);

  async function run() {
    if (!active) return;
    if (active.confirmation_required) {
      const ok = await appConfirm({
        title: "اجرای اقدام",
        message: `اجرای «${active.label}» انجام شود؟`,
        confirmLabel: "اجرا",
      });
      if (!ok) return;
    }
    setLoading(true);
    setError(null);
    const promptLabel = active.label || active.slug;
    const userLine = `اقدام: ${promptLabel}`;
    onRunStart?.(userLine);
    try {
      const res = await runAgentAction(agent.id, active.slug, mergeActionVars(active, vars));
      onChatExchange?.(userLine, res.output ?? "");
      onResult?.(res.output);
    } catch (e: unknown) {
      const apiErr = handleApiError(e, {
        event: "action.run",
        toast: true,
        toastTitle: "خطا در اجرای اقدام",
      });
      setError(apiErr.message);
      onChatExchange?.(userLine, `خطا در اجرا: ${apiErr.message}`);
    } finally {
      setLoading(false);
    }
  }

  if (!actions.length) {
    return <p className="text-sm text-stone-500">اقدام عملیاتی تعریف نشده است.</p>;
  }

  const props = active ? getInputProperties(active.input_schema) : {};
  const entries = Object.entries(props);

  return (
    <div className="flex min-h-[12rem] flex-col">
      <div className="flex-1 space-y-4">
        <div>
          <label htmlFor="worker-action-select" className="mb-1.5 block text-xs font-semibold text-stone-600">
            انتخاب اقدام
          </label>
          <select
            id="worker-action-select"
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {actions.map((act) => (
              <option key={act.slug} value={act.slug}>
                {act.label || act.slug}
              </option>
            ))}
          </select>
        </div>

        {active?.description && (
          <p className="text-xs leading-relaxed text-stone-500">{active.description}</p>
        )}

        {entries.length === 0 ? (
          <p className="text-xs text-stone-500">بدون ورودی اضافی</p>
        ) : (
          entries.map(([key, schema]) => (
            <div key={key}>
              <label className="mb-1 block text-xs text-stone-500">{schema?.title ?? key}</label>
              <Input
                value={vars[key] ?? ""}
                placeholder={
                  schema?.default !== undefined && schema?.default !== null
                    ? String(schema.default)
                    : undefined
                }
                onChange={(e) => setVars({ ...vars, [key]: e.target.value })}
              />
            </div>
          ))
        )}

        {error && <p className="text-sm text-accent-red">{error}</p>}
      </div>

      <div className="mt-4 shrink-0 border-t border-stone-100 pt-4">
        <Button className="w-full" onClick={run} disabled={loading || !active}>
          {loading ? <LoadingSpinner /> : <Play className="h-4 w-4" />}
          اجرا
        </Button>
      </div>
    </div>
  );
}