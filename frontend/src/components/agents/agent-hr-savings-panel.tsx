"use client";

import { Clock, Coins, TrendingDown, UserRound } from "lucide-react";
import { StaggerItem } from "@/components/motion/stagger";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ClientNumber } from "@/components/ui/client-date";
import type { AgentDashboardHrSavings } from "@/types";

type Props = {
  savings: AgentDashboardHrSavings;
};

export function AgentHrSavingsPanel({ savings }: Props) {
  if (!savings?.role_title) return null;

  const humanCost = savings.human_cost_irr ?? 0;
  const agentCost = savings.agent_cost_irr ?? 0;
  const usdRate = savings.usd_to_irr_rate ?? 620_000;

  const humanPct =
    humanCost + agentCost > 0 ? Math.round((100 * humanCost) / (humanCost + agentCost)) : 50;
  const agentPct = 100 - humanPct;

  return (
    <StaggerItem variant="slideUp">
      <Card className="border-accent-green/30 bg-gradient-to-l from-accent-green/5 via-white to-brand-50/40">
        <CardHeader className="space-y-2 border-b border-surface-border/80 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-stone-900">صرفه‌جویی نسبت به منابع انسانی</h3>
              <p className="mt-1 text-xs text-stone-500">
                مقایسه هزینه و زمان ایجنت با{" "}
                <span className="font-semibold text-stone-700">{savings.role_title}</span>
                {" · "}
                {savings.period_label}
              </p>
            </div>
            <Badge variant={savings.uses_live_activity ? "success" : "muted"}>
              {savings.uses_live_activity ? "بر اساس اجرای واقعی" : "برآورد نمونه"}
            </Badge>
          </div>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-surface-border bg-white/80 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
                <Clock className="h-4 w-4 text-brand-600" aria-hidden />
                زمان صرفه‌جویی‌شده
              </div>
              <p className="mt-2 text-2xl font-bold text-accent-green">{savings.time_saved_label}</p>
              <p className="mt-1 text-xs text-stone-500">
                کارمند: {savings.human_hours_label} · ایجنت: {savings.agent_hours_label}
              </p>
            </div>
            <div className="rounded-xl border border-surface-border bg-white/80 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
                <Coins className="h-4 w-4 text-brand-600" aria-hidden />
                صرفه‌جویی مالی
              </div>
              <p className="mt-2 text-2xl font-bold text-accent-green">{savings.money_saved_label}</p>
              <p className="mt-1 text-xs text-stone-500">
                {savings.savings_percent}٪ کمتر از هزینه نیروی انسانی معادل
              </p>
            </div>
            <div className="rounded-xl border border-surface-border bg-white/80 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
                <TrendingDown className="h-4 w-4 text-brand-600" aria-hidden />
                مصرف توکن
              </div>
              <p className="mt-2 text-2xl font-bold text-stone-900" dir="ltr">
                <ClientNumber value={savings.tokens_total} />
              </p>
              <p className="mt-1 text-xs text-stone-500">{savings.run_count} اجرا در دوره</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-600">مقایسه هزینه (ریال)</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-stone-100">
              <div
                className="bg-stone-400 transition-all"
                style={{ width: `${humanPct}%` }}
                title={`کارمند: ${savings.human_cost_label}`}
              />
              <div
                className="bg-accent-green transition-all"
                style={{ width: `${agentPct}%` }}
                title={`ایجنت: ${savings.agent_cost_label}`}
              />
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-stone-600">
              <span className="flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5 text-stone-400" aria-hidden />
                کارمند ({savings.role_title}):{" "}
                <strong className="text-stone-800">{savings.human_cost_label}</strong>
              </span>
              <span>
                ایجنت (توکن): <strong className="text-accent-green">{savings.agent_cost_label}</strong>
              </span>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-stone-400">
            حقوق ماهانه مرجع:{" "}
            <ClientNumber value={savings.employee_monthly_salary_irr ?? 0} /> ریال (معادل ساعتی{" "}
            <ClientNumber value={savings.employee_hourly_irr ?? 0} /> ریال) · نرخ تبدیل دلار:{" "}
            <ClientNumber value={usdRate} /> ریال
          </p>
        </CardBody>
      </Card>
    </StaggerItem>
  );
}
