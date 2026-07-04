"use client";

import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { performLogout } from "@/lib/logout-flow";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="page-padding flex min-h-[50vh] flex-col items-center justify-center">
      <Card className="max-w-md w-full text-center">
        <CardBody className="space-y-4 py-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <Settings className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-stone-900">تنظیمات</h1>
          <p className="text-lg font-semibold text-stone-700">این صفحه در حال طراحی است</p>
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
