"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Ban, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/loading";
import { ClientDateTime } from "@/components/ui/client-date";
import { fetchJob, cancelJob } from "@/lib/job-client";
import { useAuthStore } from "@/stores/auth-store";
import { appAlert } from "@/lib/app-dialog";
import type { JobStatus } from "@/types";

const STATUS_VARIANT: Record<JobStatus, "default" | "success" | "warning" | "danger" | "muted"> = {
  queued: "muted",
  running: "warning",
  extracting: "warning",
  validating: "warning",
  succeeded: "success",
  failed: "danger",
  cancelled: "muted",
  timed_out: "danger",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "در صف",
  running: "در حال اجرا",
  extracting: "استخراج",
  validating: "اعتبارسنجی",
  succeeded: "موفق",
  failed: "ناموفق",
  cancelled: "لغوشده",
  timed_out: "زمان‌گذشته",
};

const CANCELABLE: JobStatus[] = ["queued", "running"];

function JsonView({ data }: { data?: Record<string, unknown> }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs text-stone-400">—</p>;
  }
  return (
    <pre
      dir="ltr"
      className="overflow-x-auto rounded-xl bg-stone-900/90 p-3 text-xs leading-relaxed text-stone-100"
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const qc = useQueryClient();
  const isSuperuser = useAuthStore((s) => s.user?.is_superuser);

  const { data: job, isLoading, isError } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId),
    retry: false,
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelJob(jobId),
    onSuccess: (j) => qc.setQueryData(["job", jobId], j),
    onError: () =>
      appAlert({
        title: "خطا",
        message: "لغو کار ممکن نشد.",
        tone: "danger",
      }),
  });

  if (isLoading) {
    return (
      <div className="page-padding flex items-center justify-center py-16">
        <LoadingSpinner tone="neutral" />
      </div>
    );
  }
  if (isError || !job) {
    return (
      <div className="page-padding space-y-4">
        <p className="text-sm text-accent-red">کار «{jobId}» پیدا نشد.</p>
        <Link href="/agents">
          <Button variant="secondary">بازگشت به ایجنت‌ها</Button>
        </Link>
      </div>
    );
  }

  const canCancel = isSuperuser && CANCELABLE.includes(job.status);

  return (
    <div className="page-padding space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/agents/${job.agent_id}/jobs`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <ArrowRight className="h-3 w-3 rotate-180" />
            تاریخچه کارها
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-bold text-stone-900 sm:text-2xl">
              {job.id.slice(0, 8)}
            </h1>
            <Badge variant={STATUS_VARIANT[job.status]} dir="ltr">
              {STATUS_LABEL[job.status]}
            </Badge>
            <Badge variant="muted" dir="ltr">
              {job.backend}
            </Badge>
            <Badge variant="muted" dir="ltr">
              {job.precision}
            </Badge>
          </div>
        </div>
        {canCancel && (
          <Button
            variant="danger"
            disabled={cancelMut.isPending}
            onClick={() =>
              appAlert({
                title: "لغو کار",
                message: "این کار لغو شود؟",
                confirmLabel: "لغو کار",
                tone: "danger",
              }).then(() => cancelMut.mutate())
            }
          >
            {cancelMut.isPending ? <LoadingSpinner /> : <Ban className="h-4 w-4" />}
            لغو کار
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-bold">مشخصات</h3>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <p>
            <span className="text-stone-500">شناسه ایجنت:</span>{" "}
            <span dir="ltr" className="font-mono text-stone-700">
              {job.agent_id}
            </span>
          </p>
          <p>
            <span className="text-stone-500">کاربر:</span>{" "}
            <span dir="ltr" className="font-mono text-stone-700">
              {job.user_id}
            </span>
          </p>
          <p>
            <span className="text-stone-500">ایجاد:</span>{" "}
            <ClientDateTime iso={job.created_at} />
          </p>
          <p>
            <span className="text-stone-500">شروع:</span>{" "}
            {job.started_at ? <ClientDateTime iso={job.started_at} /> : "—"}
          </p>
          <p>
            <span className="text-stone-500">پایان:</span>{" "}
            {job.finished_at ? <ClientDateTime iso={job.finished_at} /> : "—"}
          </p>
          {typeof job.timeout_seconds === "number" && (
            <p>
              <span className="text-stone-500">مهلت (ثانیه):</span> {job.timeout_seconds}
            </p>
          )}
          {typeof job.memory_limit_mb === "number" && (
            <p>
              <span className="text-stone-500">حافظه (MB):</span> {job.memory_limit_mb}
            </p>
          )}
        </CardBody>
      </Card>

      {job.error && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-accent-red">خطا</h3>
          </CardHeader>
          <CardBody>
            <p dir="ltr" className="break-words text-sm text-accent-red">
              {job.error}
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="font-bold">ورودی (input)</h3>
        </CardHeader>
        <CardBody>
          <JsonView data={job.input} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-bold">خروجی (output)</h3>
        </CardHeader>
        <CardBody>
          <JsonView data={job.output} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-bold">قطعات خروجی (artifacts)</h3>
        </CardHeader>
        <CardBody className="space-y-2">
          {!job.artifacts || job.artifacts.length === 0 ? (
            <p className="text-sm text-stone-400">قطعه‌ای ثبت نشده است.</p>
          ) : (
            job.artifacts.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50/60 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-stone-500" />
                  <span dir="ltr" className="truncate text-sm text-stone-800">
                    {a.relative_path}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {a.mime_type && (
                    <Badge variant="muted" dir="ltr">
                      {a.mime_type}
                    </Badge>
                  )}
                  {typeof a.size_bytes === "number" && (
                    <span dir="ltr" className="text-xs text-stone-500">
                      {(a.size_bytes / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
                {a.description && (
                  <p className="w-full text-xs text-stone-500">{a.description}</p>
                )}
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
