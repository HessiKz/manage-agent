"use client";

import { useExecutionJob } from "@/hooks/use-execution-job";
import type { JobStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

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

export function JobProgressPanel({ jobId }: { jobId: string | null }) {
  const job = useExecutionJob(jobId);
  if (!jobId) return null;

  const total = job.progress?.total ?? 0;
  const step = job.progress?.step ?? 0;
  const pct = total > 0 ? Math.round((step / total) * 100) : job.done ? 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">پیشرفت اجرا</h3>
          <Badge variant={(job.status !== "unknown" ? STATUS_VARIANT[job.status] : "muted") as "muted"} dir="ltr">
            {job.status !== "unknown" ? (STATUS_LABEL[job.status] ?? job.status) : "—"}
          </Badge>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {job.progress && (
          <p dir="ltr" className="text-xs text-stone-500">
            step {step} / {total}
          </p>
        )}
        {job.artifacts.length > 0 && (
          <ul className="space-y-1">
            {job.artifacts.map((a) => (
              <li key={a.id} dir="ltr" className="text-xs text-stone-700">
                {a.relative_path}
              </li>
            ))}
          </ul>
        )}
        {job.error && <p className="text-xs text-accent-red">{job.error}</p>}
      </CardBody>
    </Card>
  );
}
