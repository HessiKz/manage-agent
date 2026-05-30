"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { getInputProperties } from "@/lib/action-inputs";
import { runAgentAction } from "@/lib/api";
import { appConfirm } from "@/lib/app-dialog";
import { getErrorMessage } from "@/lib/errors";
import type { Agent, AgentAction } from "@/types";

type Props = {
  agent: Agent;
  actions: AgentAction[];
  onResult?: (output: string) => void;
  onRunStart?: (userLine: string) => void;
  onChatExchange?: (userPrompt: string, assistantOutput: string) => void;
};

export function WorkerActionGrid({ agent, actions, onResult, onRunStart, onChatExchange }: Props) {
  const [active, setActive] = useState<AgentAction | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await runAgentAction(agent.id, active.slug, vars);
      onChatExchange?.(userLine, res.output ?? "");
      onResult?.(res.output);
      setActive(null);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg);
      onChatExchange?.(userLine, `خطا در اجرا: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  if (!actions.length) {
    return (
      <p className="text-sm text-stone-500">اقدام عملیاتی تعریف نشده است.</p>
    );
  }

  return (
    <div className="space-y-4">
      <Stagger initial={false} className="grid gap-3 sm:grid-cols-2">
        {actions.map((act) => (
          <StaggerItem key={act.slug} variant="scaleIn">
            <button
              type="button"
              onClick={() => {
                setActive(act);
                setVars({});
                setError(null);
              }}
              className="w-full rounded-2xl border border-stone-200 bg-white p-4 text-right transition-colors duration-150 hover:border-brand-400 hover:bg-brand-50/40"
            >
              <p className="font-bold text-stone-900">{act.label || act.slug}</p>
              {act.description && (
                <p className="mt-1 text-xs text-stone-500 line-clamp-2">{act.description}</p>
              )}
            </button>
          </StaggerItem>
        ))}
      </Stagger>

      {active && (
        <Card>
          <CardBody className="space-y-3">
            <p className="font-semibold text-stone-800">{active.label}</p>
            {(() => {
              const props = getInputProperties(active.input_schema);
              const entries = Object.entries(props);
              if (entries.length === 0) {
                return <p className="text-xs text-stone-500">بدون ورودی اضافی</p>;
              }
              return entries.map(([key, schema]) => (
                <div key={key}>
                  <label className="block text-xs text-stone-500">{schema?.title ?? key}</label>
                  <Input
                    value={vars[key] ?? String(schema?.default ?? "")}
                    onChange={(e) => setVars({ ...vars, [key]: e.target.value })}
                  />
                </div>
              ));
            })()}
            {error && <p className="text-sm text-accent-red">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={run} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                اجرا
              </Button>
              <Button variant="secondary" onClick={() => setActive(null)}>
                انصراف
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
