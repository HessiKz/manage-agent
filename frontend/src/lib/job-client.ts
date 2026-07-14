/** API client for the async execution-job layer (sandbox + native backends). */

import { api } from "@/lib/api";
import type { ExecutionJobRead, JobArtifact, Page } from "@/types";

export async function fetchJobsForAgent(
  agentId: string,
  params?: { page?: number; page_size?: number },
): Promise<Page<ExecutionJobRead>> {
  const { data } = await api.get<Page<ExecutionJobRead>>(
    `/agents/${agentId}/jobs`,
    { params: { page: params?.page ?? 1, page_size: params?.page_size ?? 20 } },
  );
  return data;
}

export async function fetchJob(jobId: string): Promise<ExecutionJobRead> {
  const { data } = await api.get<ExecutionJobRead>(`/jobs/${jobId}`);
  return data;
}

export async function cancelJob(jobId: string): Promise<ExecutionJobRead> {
  const { data } = await api.post<ExecutionJobRead>(`/jobs/${jobId}/cancel`);
  return data;
}

export type SubmitJobPayload = {
  input: string;
  thread_id?: string | null;
  stream?: boolean;
};

export async function submitJob(
  agentId: string,
  payload: SubmitJobPayload,
): Promise<{ job_id: string }> {
  const { data } = await api.post<{ job_id: string }>(
    `/agents/${agentId}/jobs`,
    { input: payload.input, thread_id: payload.thread_id ?? null, stream: false },
  );
  return data;
}

export type { ExecutionJobRead, JobArtifact };
