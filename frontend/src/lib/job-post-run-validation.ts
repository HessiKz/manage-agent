"use client";

import type { ExecutionJob, JobArtifact } from "@/types";

/** Validate a finished job run before surfacing results to the user. */
export interface PostRunReport {
  ok: boolean;
  issues: string[];
}

export function validateJobRun(
  job: ExecutionJob,
  artifacts: JobArtifact[],
): PostRunReport {
  const issues: string[] = [];

  const terminal = [
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
  ] as const;
  if (!terminal.includes(job.status as (typeof terminal)[number])) {
    issues.push("job has not reached a terminal state");
  }

  if (job.status === "succeeded") {
    const hasOutput =
      job.output && Object.keys(job.output).length > 0;
    const hasArtifacts = artifacts.length > 0;
    if (!hasOutput && !hasArtifacts) {
      issues.push("succeeded but produced no output and no artifacts");
    }
  }

  for (const a of artifacts) {
    if (typeof a.relative_path !== "string" || a.relative_path.length === 0) {
      issues.push("artifact with empty relative_path");
      continue;
    }
    if (a.relative_path.startsWith("..") || a.relative_path.startsWith("/")) {
      issues.push(`artifact path traversal blocked: ${a.relative_path}`);
    }
    if (typeof a.size_bytes === "number" && a.size_bytes <= 0) {
      issues.push(`artifact has non-positive size: ${a.relative_path}`);
    }
  }

  if (job.error) {
    issues.push(`job error: ${job.error}`);
  }

  return { ok: issues.length === 0, issues };
}
