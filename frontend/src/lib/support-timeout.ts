export class SupportTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportTimeoutError";
  }
}

/** Reject when `ms` elapses; respects support abort signal. */
export async function withSupportTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new SupportTimeoutError(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
