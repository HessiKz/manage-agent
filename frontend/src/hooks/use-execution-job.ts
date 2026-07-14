"use client";

import { useEffect, useRef, useState } from "react";
import { getApiV1Url } from "@/lib/api-base";
import { readAccessToken } from "@/lib/auth-token";
import type { JobArtifact, JobEvent, JobStatus } from "@/types";

export interface ExecutionJobState {
  status: JobStatus | "unknown";
  progress: { step: number; total: number } | null;
  artifacts: JobArtifact[];
  error: string | null;
  done: boolean;
}

/** Subscribe to a job's live SSE progress stream (token-authenticated). */
export function useExecutionJob(jobId: string | null) {
  const [state, setState] = useState<ExecutionJobState>({
    status: "queued",
    progress: null,
    artifacts: [],
    error: null,
    done: false,
  });
  const esRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const ctrl = new AbortController();
    esRef.current = ctrl;

    (async () => {
      let token: string | null = null;
      try {
        token = readAccessToken();
      } catch {
        token = null;
      }
      const url = `${getApiV1Url()}/jobs/${jobId}/events`;
      try {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: ctrl.signal,
        });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!ctrl.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              applyEvent(JSON.parse(payload) as JobEvent);
            } catch {
              /* ignore malformed */
            }
          }
        }
      } catch {
        /* aborted or network error — keep last state */
      }
    })();

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function applyEvent(ev: JobEvent) {
    setState((prev) => {
      switch (ev.type) {
        case "queued":
          return { ...prev, status: "queued" };
        case "started":
          return { ...prev, status: "running" };
        case "progress":
          return { ...prev, status: "running", progress: { step: ev.step, total: ev.total } };
        case "validating":
          return { ...prev, status: "validating" };
        case "artifact":
          return { ...prev, artifacts: [...prev.artifacts, ev.artifact] };
        case "done":
          return { ...prev, status: "succeeded", done: true, artifacts: ev.artifacts };
        case "error":
          return { ...prev, status: "failed", done: true, error: ev.message };
        default:
          return prev;
      }
    });
  }

  return state;
}
