"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Clock,
  Coins,
  Cog,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  fetchEvents,
  fetchOverview,
  fetchTopAgents,
  fetchUsage,
} from "@/lib/api";
import { POPULAR_AGENT_LIMIT, pickPopularAgents } from "@/lib/top-agent-card";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentCardSkeleton } from "@/components/ui/skeleton";
import { ClientDate, ClientDateTime } from "@/components/ui/client-date";
import { useAuthStore } from "@/stores/auth-store";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { cn } from "@/lib/utils";
import type { Overview, PlatformEvent, UsagePoint } from "@/types";

type Widget = "events" | "usage" | "top-agents";

const WIDGET_LABELS: Record<Widget, string> = {
  events: "رویدادهای اخیر",
  usage: "نمودار روند اجرا",
  "top-agents": "ایجنت‌های برتر",
};

const STORAGE_KEY = "ma_dashboard_widgets";

/** Defer running localStorage until client hydration to avoid SSR/window races. */
function loadEnabledWidgets(): Widget[] {
  if (typeof window === "undefined") return ["events"];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return ["events"];
    const parsed = JSON.parse(raw) as Widget[];
    const known = ["events", "usage", "top-agents"] as const;
    return parsed.filter((w) => (known as readonly string[]).includes(w));
  } catch {
    return ["events"];
  }
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [enabledWidgets, setEnabledWidgets] = useState<Widget[]>(["events"]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setEnabledWidgets(loadEnabledWidgets());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledWidgets));
  }, [enabledWidgets]);

  const { data: overview } = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
    enabled: enabledWidgets.includes("events"),
  });
  const { data: usage = [], isLoading: usageLoading } = useQuery({
    queryKey: ["usage", 30],
    queryFn: () => fetchUsage(30),
    enabled: enabledWidgets.includes("usage"),
  });
  const { data: topAgents = [], isLoading: topLoading } = useQuery({
    queryKey: ["top-agents", POPULAR_AGENT_LIMIT],
    queryFn: () => fetchTopAgents(POPULAR_AGENT_LIMIT),
    enabled: enabledWidgets.includes("top-agents"),
  });

  const popularAgents = useMemo(() => pickPopularAgents(topAgents), [topAgents]);
  const usageMax = useMemo(() => Math.max(1, ...usage.map((u) => u.runs)), [usage]);

  function addWidget(w: Widget) {
    setEnabledWidgets((prev) => (prev.includes(w) ? prev : [...prev, w]));
    setShowPicker(false);
  }
  function removeWidget(w: Widget) {
    setEnabledWidgets((prev) => prev.filter((x) => x !== w));
  }

  return (
    <Stagger
      initial={false}
      className="page-padding space-y-6"
      delayChildren={0.03}
      staggerChildren={0.05}
    >
      <StaggerItem variant="slideUp">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">
              سلام {user?.full_name?.split(" ")[0] ?? "کاربر"}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {overview
                ? `${overview.agents.active} ایجنت فعال · ${overview.runs.total} اجرا · نرخ موفقیت ${overview.success_rate.toFixed(0)}%`
                : "نمای کلی فضای کار"}{" "}
              · <ClientDate />
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition-colors hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
          >
            <Cog className="h-4 w-4" />
            تمایل دارید چه اطلاعاتی اضافه کنید؟
          </button>
        </div>
      </StaggerItem>

      {/* Overview stat cards — always shown */}
      <StaggerItem variant="scaleIn">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <OverviewStat
            label="اجراها (کل)"
            value={overview?.runs.total ?? null}
            icon={Activity}
            hint={overview ? `${overview.runs.this_week} این هفته` : undefined}
          />
          <OverviewStat
            label="نرخ موفقیت"
            value={overview ? `${overview.success_rate.toFixed(0)}%` : null}
            icon={TrendingUp}
            hint={overview ? `${overview.runs.successful} اجرای موفق` : undefined}
          />
          <OverviewStat
            label="هزینه (USD)"
            value={overview ? `$${overview.total_cost_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : null}
            icon={Coins}
            hint={overview ? `${overview.agents.active}/${overview.agents.total} ایجنت فعال` : undefined}
          />
          <OverviewStat
            label="رویداد اخیر"
            value={events.length ? `${events.length} مورد` : null}
            icon={Clock}
            hint="آخرین فعالیت‌ها"
          />
        </div>
      </StaggerItem>

      {/* Events */}
      {enabledWidgets.includes("events") && (
        <DashboardWidget variant="slideUp" title="رویدادهای اخیر" onRemove={() => removeWidget("events")}>
          {eventsLoading ? (
            <p className="text-sm text-stone-500">در حال بارگذاری…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-stone-500">هیچ رویدادی ثبت نشده است.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {events.map((ev: PlatformEvent) => (
                <li key={ev.id} className="flex items-start gap-3 py-2.5">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      ev.severity === "warning" || ev.severity === "error"
                        ? "bg-amber-500"
                        : "bg-brand-500"
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-stone-800">{ev.message}</p>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {ev.type} · <ClientDateTime iso={ev.created_at} />
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DashboardWidget>
      )}

      {/* Usage chart */}
      {enabledWidgets.includes("usage") && (
        <DashboardWidget variant="scaleIn" title="نمودار روند اجرا (۳۰ روز اخیر)" onRemove={() => removeWidget("usage")}>
          {usageLoading ? (
            <p className="text-sm text-stone-500">در حال بارگذاری…</p>
          ) : usage.length === 0 ? (
            <p className="text-sm text-stone-500">نموداری برای نمایش نیست.</p>
          ) : (
            <div className="flex h-40 items-end gap-1" dir="ltr">
              {usage.map((u: UsagePoint, i: number) => (
                <div
                  key={i}
                  className="group relative flex flex-1 items-end"
                  title={`${u.day.slice(5, 10)} · ${u.runs} اجرا`}
                >
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-brand-500 to-brand-300 transition-all duration-200 group-hover:from-brand-600 group-hover:to-brand-400"
                    style={{ height: `${Math.max(2, (u.runs / usageMax) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
          )}
        </DashboardWidget>
      )}

      {/* Top agents */}
      {enabledWidgets.includes("top-agents") && (
        <DashboardWidget variant="slideUp" title="ایجنت‌های برتر" onRemove={() => removeWidget("top-agents")}>
          {topLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: POPULAR_AGENT_LIMIT }).map((_, i) => (
                <AgentCardSkeleton key={i} />
              ))}
            </div>
          ) : popularAgents.length === 0 ? (
            <p className="text-sm text-stone-500">هنوز اجرایی ثبت نشده است.</p>
          ) : (
            <Stagger
              delayChildren={0.03}
              staggerChildren={0.05}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              {popularAgents.map(({ agent, runs, isNew }) => (
                <StaggerItem key={agent.id} variant="slideUp">
                  <AgentCard agent={agent} runs={runs} isNew={isNew} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </DashboardWidget>
      )}

      {/* Widget picker modal */}
      {showPicker && (
        <WidgetPicker
          enabled={enabledWidgets}
          onAdd={addWidget}
          onClose={() => setShowPicker(false)}
        />
      )}
    </Stagger>
  );
}

function OverviewStat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number | null;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-stone-100 bg-white px-4 py-4 shadow-sm transition-shadow hover:shadow-glow">
      <div className="flex items-center gap-2 text-stone-500">
        <Icon className="h-4 w-4 text-brand-600" />
        <p className="text-xs">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-stone-900">
        {value ?? "—"}
      </p>
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}

function DashboardWidget({
  title,
  children,
  onRemove,
  variant,
}: {
  title: string;
  children: React.ReactNode;
  onRemove: () => void;
  variant: "slideUp" | "scaleIn";
}) {
  return (
    <StaggerItem variant={variant}>
      <div className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">{title}</h2>
          <button
            type="button"
            onClick={onRemove}
            title="حذف از داشبورد"
            className="inline-flex items-center gap-1 rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </StaggerItem>
  );
}

function WidgetPicker({
  enabled,
  onAdd,
  onClose,
}: {
  enabled: Widget[];
  onAdd: (w: Widget) => void;
  onClose: () => void;
}) {
  const allWidgets: Widget[] = ["events", "usage", "top-agents"];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-stone-100 bg-white p-5 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-stone-900">افزودن بخش به داشبورد</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            aria-label="بستن"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-stone-500">
          هر بخش را که می‌خواهید در داشبورد شما نمایش داده شود انتخاب کنید. بخش‌های فعال{" "}
          <span className="font-semibold text-stone-700">برجسته</span> هستند.
        </p>
        <div className="space-y-2">
          {allWidgets.map((w) => {
            const active = enabled.includes(w);
            return (
              <button
                key={w}
                type="button"
                disabled={active}
                onClick={() => onAdd(w)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors",
                  active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-stone-200 bg-white text-stone-700 hover:border-brand-300 hover:bg-brand-50"
                )}
              >
                <span className="font-medium">{WIDGET_LABELS[w]}</span>
                {active ? (
                  <span className="text-xs">✓ نمایش داده می‌شود</span>
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
