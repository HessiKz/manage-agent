/** Page-local handlers for support-agent UI automation (React state, not silent API). */

import { sleepAbortable, throwIfSupportAborted } from "@/lib/support-abort";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";

export type SupportBridgeHandler = (
  payload: Record<string, unknown> | undefined,
  ctx: SupportPlayerContext
) => Promise<void>;

const handlers = new Map<string, SupportBridgeHandler>();

export function registerSupportBridge(action: string, handler: SupportBridgeHandler): () => void {
  handlers.set(action, handler);
  return () => {
    if (handlers.get(action) === handler) handlers.delete(action);
  };
}

export function hasSupportBridge(action: string): boolean {
  return handlers.has(action);
}

const DEFAULT_BRIDGE_TIMEOUT_MS = 120_000;

export async function waitForDomSelector(
  selector: string,
  timeoutMs = DEFAULT_BRIDGE_TIMEOUT_MS,
  intervalMs = 200
): Promise<Element> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    const el = document.querySelector(selector);
    if (el) return el;
    await sleepAbortable(intervalMs);
  }
  throw new Error(`عنصر رابط کاربری هنوز بارگذاری نشده (${selector})`);
}

export async function waitForSupportBridge(
  action: string,
  timeoutMs = DEFAULT_BRIDGE_TIMEOUT_MS,
  intervalMs = 150
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    if (hasSupportBridge(action)) return;
    await sleepAbortable(intervalMs);
  }
  throw new Error(`زمان انتظار برای بارگذاری صفحه به پایان رسید (${action})`);
}

export async function runSupportBridge(
  action: string,
  payload: Record<string, unknown> | undefined,
  ctx: SupportPlayerContext,
  opts?: { waitTimeoutMs?: number }
): Promise<void> {
  if (!hasSupportBridge(action)) {
    await waitForSupportBridge(action, opts?.waitTimeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS);
  }
  const handler = handlers.get(action);
  if (!handler) {
    throw new Error(`صفحهٔ مقصد هنوز آماده نیست (${action})`);
  }
  await handler(payload, ctx);
}
