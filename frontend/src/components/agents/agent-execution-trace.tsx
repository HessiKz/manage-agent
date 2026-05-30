"use client";

import { Brain, Cpu, Hammer, MessageSquare, Settings2, Wrench } from "lucide-react";
import type { ExecutionTraceStep } from "@/types";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<string, typeof Brain> = {
  llm_config: Settings2,
  llm_request: Cpu,
  llm_response: MessageSquare,
  tool_call: Wrench,
  tool_result: Hammer,
  user_input: MessageSquare,
  supervisor: Brain,
};

const KIND_STYLE: Record<string, string> = {
  llm_config: "border-brand-200 bg-brand-50/60",
  llm_request: "border-blue-200 bg-blue-50/50",
  llm_response: "border-accent-green/30 bg-emerald-50/40",
  tool_call: "border-amber-200 bg-amber-50/50",
  tool_result: "border-stone-200 bg-stone-50/80",
  user_input: "border-surface-border bg-surface-muted/40",
  supervisor: "border-purple-200 bg-purple-50/40",
};

type Props = {
  trace: ExecutionTraceStep[];
  modelName?: string | null;
  llmProvider?: string | null;
  className?: string;
};

export function AgentExecutionTrace({
  trace,
  modelName,
  llmProvider,
  className,
}: Props) {
  if (!trace.length) {
    return (
      <p className="text-xs text-stone-500">
        ردیابی AI برای این مرحله ثبت نشد — احتمالاً LLM در دسترس نبود.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {(modelName || llmProvider) && (
        <p className="text-[11px] font-medium text-brand-800">
          API: {llmProvider ?? "openai"} · {modelName ?? "—"}
        </p>
      )}
      <ol className="space-y-1.5">
        {trace.map((step, i) => {
          const Icon = KIND_ICON[step.kind] ?? Brain;
          return (
            <li
              key={`${step.kind}-${step.step ?? i}`}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-[11px]",
                KIND_STYLE[step.kind] ?? "border-stone-200 bg-white"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-800">
                    {step.step != null ? `${step.step}. ` : ""}
                    {step.label}
                  </p>
                  {step.detail && (
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-sans text-stone-600">
                      {step.detail}
                    </pre>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
