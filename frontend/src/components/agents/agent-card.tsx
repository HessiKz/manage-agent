"use client";

import Link from "next/link";
import { ArrowLeft, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import {
  StatCardChart,
  type StatCardChartVariant,
} from "@/components/charts/stat-card-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { cn, deptLabel, hasMetricSymbols, statusLabel } from "@/lib/utils";
import type { Agent, ExecutionPrecision } from "@/types";

const PRECISION_BADGE: Record<ExecutionPrecision, { label: string; variant: "default" | "warning" | "danger" | "risk" | "success" | "muted" }> = {
  deterministic: { label: "قطعی", variant: "muted" },
  guided: { label: "هدایت‌شده", variant: "default" },
  autonomous: { label: "خودکار", variant: "risk" },
};

function precisionBadge(precision?: string) {
  if (!precision || !(precision in PRECISION_BADGE)) return null;
  return PRECISION_BADGE[precision as ExecutionPrecision];
}

export function AgentCard({
  agent,
  runs = 0,
  isNew = false,
  editHref,
  manage,
}: {
  agent: Agent;
  runs?: number;
  isNew?: boolean;
  editHref?: string;
  manage?: {
    busy?: boolean;
    onToggleActive?: (agent: Agent) => void;
    onDelete?: (agent: Agent) => void;
  };
}) {
  const isActive = agent.status === "active";
  return (
    <Card className="h-full transition-[border-color,box-shadow] duration-200 hover:border-brand-300 hover:shadow-glow">
      <CardBody className="flex h-full flex-col space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-bold text-stone-900">{agent.name}</h3>
            <p className="text-xs text-stone-500">{deptLabel(agent.department)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {isNew && <Badge variant="warning">جدید</Badge>}
            {(() => {
              const b = precisionBadge(agent.config_json?.execution_precision as string | undefined);
              return b ? <Badge key="precision" variant={b.variant}>{b.label}</Badge> : null;
            })()}
            <Badge variant={isActive ? "success" : "muted"}>
              {statusLabel(agent.status)}
            </Badge>
          </div>
        </div>
        <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-stone-600">
          {agent.description}
        </p>
        <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
          <span>{runs} اجرا</span>
          <div className="flex flex-wrap items-center gap-2">
            {manage?.onToggleActive && (
              <button
                type="button"
                disabled={manage.busy}
                onClick={() => manage.onToggleActive?.(agent)}
                title={isActive ? "غیرفعال کردن" : "فعال کردن"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  isActive
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                {isActive ? (
                  <>
                    <PowerOff className="h-3 w-3" />
                    غیرفعال
                  </>
                ) : (
                  <>
                    <Power className="h-3 w-3" />
                    فعال
                  </>
                )}
              </button>
            )}
            {editHref && (
              <Link
                href={editHref}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 font-medium text-stone-700 hover:bg-stone-50"
              >
                <Pencil className="h-3 w-3" />
                ویرایش
              </Link>
            )}
            {manage?.onDelete && (
              <button
                type="button"
                disabled={manage.busy}
                onClick={() => manage.onDelete?.(agent)}
                title="حذف ایجنت"
                className="inline-flex items-center gap-1 rounded-lg border border-accent-red/30 bg-accent-red/5 px-2 py-1 font-medium text-accent-red transition-colors hover:bg-accent-red/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                حذف
              </button>
            )}
            <Link
              href={`/agents/${agent.slug}`}
              className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-800"
            >
              داشبورد
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </CardBody>
    </Card>
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
