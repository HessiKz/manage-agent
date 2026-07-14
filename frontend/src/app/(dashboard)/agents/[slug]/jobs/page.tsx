"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSpinner } from "@/components/loading";
import { ClientDateTime } from "@/components/ui/client-date";
import { fetchAgentBySlug, fetchMe } from "@/lib/api";
import { fetchJobsForAgent, submitJob } from "@/lib/job-client";
import { useFeatureFlag } from "@/lib/feature-flags";
import { appAlert } from "@/lib/app-dialog";
import type { ExecutionJobRead, JobStatus } from "@/types";

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

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export default function AgentJobsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const sandboxFlag = useFeatureFlag("sandbox_execution_enabled");
  const [page, setPage] = useState(1);
  const [sandboxInput, setSandboxInput] = useState("");

  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ["agent", slug],
    queryFn: () => fetchAgentBySlug(slug),
    retry: false,
  });

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const {
    data: jobsPage,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["agent-jobs", agent?.id, page],
    queryFn: () => fetchJobsForAgent(agent!.id, { page, page_size: 20 }),
    enabled: !!agent?.id,
  });

  const sandboxMut = useMutation({
    mutationFn: (input: string) => submitJob(agent!.id, { input }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["agent-jobs", agent!.id] });
      router.push(`/jobs/${res.job_id}`);
    },
    onError: () =>
      appAlert({
        title: "خطا",
        message: "ارسال کار به محیط سندباکس ممکن نشد.",
        tone: "danger",
      }),
  });

  const jobs: ExecutionJobRead[] = jobsPage?.items ?? [];
  const total = jobsPage?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  const canSandbox =
    sandboxFlag &&
    !!agent &&
    (agent.kind === "worker" ||
      agent.kind === "supervisor" ||
      agent.capabilities?.supervisor_enabled === true);
  const isSuperuser = !!me?.is_superuser;

  if (agentLoading) {
    return <div className="page-padding text-stone-500">در حال بارگذاری ایجنت…</div>;
  }
  if (isError || !agent) {
    return (
      <div className="page-padding space-y-4">
        <p className="text-sm text-accent-red">ایجنت «{slug}» پیدا نشد.</p>
        <Button variant="secondary" onClick={() => router.push("/agents")}>
          بازگشت به فهرست ایجنت‌ها
        </Button>
      </div>
    );
  }

  return (
    <div className="page-padding space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-stone-500">ایجنت / {agent.name} / تاریخچه کارها</p>
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">تاریخچه اجراهای سندباکس</h1>
        </div>
        <Link href={`/agents/${slug}`}>
          <Button variant="secondary">بازگشت به ایجنت</Button>
        </Link>
      </div>

      {canSandbox && isSuperuser && (
        <Card>
          <CardHeader>
            <h3 className="font-bold">اجرا در محیط سندباکس</h3>
          </CardHeader>
          <CardBody className="space-y-2">
            <Input
              dir="ltr"
              value={sandboxInput}
              onChange={(e) => setSandboxInput(e.target.value)}
              placeholder="دستور یا ورودی اجرا…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && sandboxInput.trim()) {
                  sandboxMut.mutate(sandboxInput.trim());
                }
              }}
            />
            <Button
              disabled={!sandboxInput.trim() || sandboxMut.isPending}
              onClick={() => sandboxMut.mutate(sandboxInput.trim())}
            >
              {sandboxMut.isPending ? <LoadingSpinner /> : <Play className="h-4 w-4" />}
              اجرا در سندباکس
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">کارها</h3>
            <p className="mt-0.5 text-xs text-stone-500">{total} کار</p>
          </div>
        </CardHeader>
        <CardBody className="space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner tone="neutral" />
            </div>
          )}
          {!isLoading && jobs.length === 0 && (
            <EmptyState
              icon={Play}
              title="کاری ثبت نشده"
              description="هنوز اجرایی در محیط سندباکس برای این ایجنت ثبت نشده است."
            />
          )}
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/jobs/${j.id}`}
              className="block rounded-xl border border-stone-100 bg-stone-50/60 px-4 py-3 transition hover:border-brand-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span dir="ltr" className="font-semibold text-stone-900">
                    {shortId(j.id)}
                  </span>
                  <Badge variant="muted" dir="ltr">
                    {j.backend}
                  </Badge>
                  <Badge
                    variant={STATUS_VARIANT[j.status]}
                    dir="ltr"
                  >
                    {STATUS_LABEL[j.status]}
                  </Badge>
                  <Badge variant="muted" dir="ltr">
                    {j.precision}
                  </Badge>
                </div>
                <div className="text-right text-xs text-stone-500">
                  <ClientDateTime iso={j.created_at} />
                </div>
              </div>
              {j.error && (
                <p dir="ltr" className="mt-1 truncate text-xs text-accent-red">
                  {j.error}
                </p>
              )}
              {j.finished_at && (
                <p className="mt-0.5 text-xs text-stone-400">
                  پایان: <ClientDateTime iso={j.finished_at} />
                </p>
              )}
            </Link>
          ))}

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="secondary"
                className="px-3 py-1 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                قبلی
              </Button>
              <span className="text-xs text-stone-500">
                {page} / {pageCount}
              </span>
              <Button
                variant="secondary"
                className="px-3 py-1 text-xs"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                بعدی
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
