"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

type Props = {
  error: Error;
  onRetry?: () => void;
  segment?: string;
};

export function ErrorFallback({ error, onRetry, segment }: Props) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <CardBody className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-red/10">
            <AlertTriangle className="h-6 w-6 text-accent-red" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-bold text-stone-900">مشکلی پیش آمد</h2>
            {segment && (
              <p className="mt-1 text-xs text-stone-400">بخش: {segment}</p>
            )}
            <p className="mt-2 text-sm text-stone-600">{error.message}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {onRetry && (
              <Button type="button" onClick={onRetry}>
                <RefreshCw className="ms-2 h-4 w-4" />
                تلاش مجدد
              </Button>
            )}
            <Link href="/dashboard">
              <Button variant="secondary">بازگشت به داشبورد</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
