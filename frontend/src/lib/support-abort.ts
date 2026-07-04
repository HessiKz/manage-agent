/** Cooperative abort for long-running support automation waits. */

export class SupportUiAbortError extends Error {
  constructor(message = "support-ui-aborted") {
    super(message);
    this.name = "SupportUiAbortError";
  }
}

export class SupportUiBlockedError extends Error {
  readonly blockerText: string;

  constructor(message: string) {
    super(message);
    this.name = "SupportUiBlockedError";
    this.blockerText = message;
  }
}

let activeSignal: AbortSignal | null = null;

export function bindSupportAbortSignal(signal: AbortSignal | null): void {
  activeSignal = signal;
}

export function throwIfSupportAborted(): void {
  if (activeSignal?.aborted) throw new SupportUiAbortError();
}

export async function sleepAbortable(ms: number): Promise<void> {
  const step = 80;
  let left = ms;
  while (left > 0) {
    throwIfSupportAborted();
    const chunk = Math.min(step, left);
    await new Promise((r) => setTimeout(r, chunk));
    left -= chunk;
  }
}
