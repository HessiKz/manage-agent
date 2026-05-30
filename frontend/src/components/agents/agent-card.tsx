"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  StatCardChart,
  type StatCardChartVariant,
} from "@/components/charts/stat-card-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { cn, deptLabel, hasMetricSymbols, statusLabel } from "@/lib/utils";
import type { Agent } from "@/types";

export function AgentCard({ agent, runs = 0 }: { agent: Agent; runs?: number }) {
  return (
    <Link
      href={`/agents/${agent.slug}`}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      <Card className="h-full transition-[border-color,box-shadow] duration-200 group-hover:border-brand-300 group-hover:shadow-glow">
        <CardBody className="flex h-full flex-col space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-bold text-stone-900 group-hover:text-brand-800">
                {agent.name}
              </h3>
              <p className="text-xs text-stone-500">{deptLabel(agent.department)}</p>
            </div>
            <Badge variant={agent.status === "active" ? "success" : "muted"}>
              {statusLabel(agent.status)}
            </Badge>
          </div>
          <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-stone-600">
            {agent.description}
          </p>
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>{runs} اجرا</span>
            <span className="inline-flex items-center gap-1 font-medium text-brand-600 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              باز کردن
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

export function StatCard({
  label,
  value,
  hint,
  chartVariant,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Mini sparkline on the visual left (PDF wireframe). */
  chartVariant?: StatCardChartVariant;
  className?: string;
}) {
  const hintIsWarning =
    hint != null && /بازبینی|هشدار|⚠|اضافه/.test(hint) && !/↗/.test(hint);

  return (
    <Card className={cn("overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-brand-200/80", className)}>
      <CardBody className="flex items-center gap-3 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-stone-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          {hint && (
            <p
              className={cn(
                "mt-1 text-xs",
                hintIsWarning ? "text-accent-red" : "text-accent-green"
              )}
            >
              <span
                dir={hasMetricSymbols(hint) ? "ltr" : undefined}
                className={
                  hasMetricSymbols(hint) ? "inline-block whitespace-nowrap" : undefined
                }
              >
                {hint}
              </span>
            </p>
          )}
        </div>
        {chartVariant && (
          <div dir="ltr" className="shrink-0 self-center">
            <StatCardChart variant={chartVariant} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
