"use client";

import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { fetchHealth, fetchMe } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { performLogout } from "@/lib/logout-flow";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

export default function SettingsPage() {
  const router = useRouter();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: health = [] } = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  return (
    <Stagger initial={false} className="space-y-6 p-6" delayChildren={0.03} staggerChildren={0.05}>
      <StaggerItem variant="slideUp">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">تنظیمات</h1>
          <p className="text-stone-500">پروفایل، سلامت سرویس‌ها و ترجیحات</p>
        </div>
      </div>
      </StaggerItem>

      <Stagger delayChildren={0.04} staggerChildren={0.05} className="grid gap-6 lg:grid-cols-2">
        <StaggerItem variant="scaleIn">
        <Card>
          <CardHeader>
            <h2 className="font-bold">حساب کاربری</h2>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <p>
              <span className="text-stone-500">نام: </span>
              {me?.full_name ?? "—"}
            </p>
            <p>
              <span className="text-stone-500">ایمیل: </span>
              {me?.email ?? "—"}
            </p>
            <p>
              <span className="text-stone-500">نقش: </span>
              {me?.is_superuser ? (
                <Badge>مدیر سیستم</Badge>
              ) : (
                <Badge variant="muted">کاربر</Badge>
              )}
            </p>
            <Button
              variant="danger"
              className="mt-4"
              onClick={() => performLogout(router)}
            >
              خروج از حساب
            </Button>
          </CardBody>
        </Card>
        </StaggerItem>

        <StaggerItem variant="scaleIn">
        <Card>
          <CardHeader>
            <h2 className="font-bold">سلامت پلتفرم</h2>
          </CardHeader>
          <CardBody className="space-y-2">
            {health.map((h) => (
              <div
                key={h.name}
                className="flex items-center justify-between rounded-xl border border-stone-100 px-4 py-2"
              >
                <span className="font-medium">{h.name}</span>
                <Badge variant={h.status === "healthy" ? "success" : "warning"}>
                  {h.status} · {h.latency_ms}ms
                </Badge>
              </div>
            ))}
            {health.length === 0 && (
              <p className="text-sm text-stone-400">در حال بررسی سرویس‌ها…</p>
            )}
          </CardBody>
        </Card>
        </StaggerItem>

        <StaggerItem variant="slideUp" className="lg:col-span-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-bold">ارکستراسیون و کش</h2>
          </CardHeader>
          <CardBody className="grid gap-3 text-sm text-stone-600 md:grid-cols-3">
            <div className="rounded-xl bg-brand-50/80 p-4">
              <p className="font-bold text-brand-800">کش پاسخ</p>
              <p className="mt-1">Redis — کلید بر اساس ایجنت + ورودی</p>
            </div>
            <div className="rounded-xl bg-brand-50/80 p-4">
              <p className="font-bold text-brand-800">وکتور + امبد</p>
              <p className="mt-1">pgvector + کش امبدینگ برای RAG</p>
            </div>
            <div className="rounded-xl bg-brand-50/80 p-4">
              <p className="font-bold text-brand-800">ابزارها</p>
              <p className="mt-1">LangGraph ReAct + APIهای خارجی پویا</p>
            </div>
          </CardBody>
        </Card>
        </StaggerItem>
      </Stagger>
    </Stagger>
  );
}
