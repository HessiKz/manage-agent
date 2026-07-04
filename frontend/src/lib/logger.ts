"use client";

import axios from "axios";

export type LogLevel = "debug" | "info" | "warn" | "error";

import { getApiV1Url } from "@/lib/api-base";

const sendRemote =
  process.env.NEXT_PUBLIC_LOG_CLIENT_ERRORS !== "false" &&
  typeof window !== "undefined";

const queue: Array<{
  level: LogLevel;
  message: string;
  event?: string;
  url?: string;
  stack?: string;
  context?: Record<string, unknown>;
}> = [];

let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (!sendRemote || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushLogs();
  }, 1500);
}

async function flushLogs() {
  if (!queue.length) return;
  const batch = queue.splice(0, 20);
  try {
    await axios.post(
      `${getApiV1Url()}/logs/client`,
      { entries: batch },
      { timeout: 5000 }
    );
  } catch {
    // Avoid recursive logging loops
  }
}

export function clientLog(
  level: LogLevel,
  message: string,
  opts?: {
    event?: string;
    error?: unknown;
    context?: Record<string, unknown>;
    /** Remote log level override (console stays at `level`, except error→warn in dev). */
    remoteLevel?: LogLevel;
  }
) {
  const payload = {
    level: opts?.remoteLevel ?? level,
    message: message.slice(0, 2000),
    event: opts?.event,
    url: typeof window !== "undefined" ? window.location.href : undefined,
    stack:
      opts?.error instanceof Error
        ? opts.error.stack?.slice(0, 4000)
        : undefined,
    context: opts?.context,
  };

  const consoleLevel =
    level === "error" && process.env.NODE_ENV !== "production" ? "warn" : level;

  const consoleFn =
    consoleLevel === "error"
      ? console.error
      : consoleLevel === "warn"
        ? console.warn
        : consoleLevel === "debug"
          ? console.debug
          : console.info;

  consoleFn(`[${opts?.event ?? "app"}]`, message, opts?.error ?? opts?.context ?? "");

  const remoteLevel = opts?.remoteLevel ?? level;
  if (sendRemote && (remoteLevel === "warn" || remoteLevel === "error")) {
    queue.push({ ...payload, level: remoteLevel });
    scheduleFlush();
  }
}
