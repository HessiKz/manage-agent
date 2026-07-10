"use client";

import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { performLogout } from "@/lib/logout-flow";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { AutonomyLevelPanel } from "@/components/settings/autonomy-level-panel";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="page-padding mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">تنظیمات</h1>
          <p className="text-sm text-stone-500">تنظیمات حساب و دستیار پلتفرم</p>
        </div>
      </div>

      <AutonomyLevelPanel />

      <Card className="w-full text-center">
        <CardBody className="space-y-4 py-10">
          <h2 className="text-lg font-semibold text-stone-700">بخش‌های در حال طراحی</h2>
          <p className="text-sm text-stone-500">
            به‌زودی: تکمیل پروفایل، تیکت پشتیبانی و پرداخت
          </p>
          <Button variant="danger" className="mt-4" onClick={() => performLogout(router)}>
            خروج از حساب
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
