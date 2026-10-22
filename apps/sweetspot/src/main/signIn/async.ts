export class SignInError extends Error {
  constructor(
    public readonly code: "browser" | "timeout" | "transfer" | "rollback",
    options?: ErrorOptions,
  ) {
    super(`Sign-in ${code}`, options);
  }
}

export function checkAbort(signal: AbortSignal): void {
  signal.throwIfAborted();
}

/** The operation must also observe the signal or be destroyed by its owner in finally. */
export function bounded<T>(operation: Promise<T>, signal: AbortSignal, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => finish(() => reject(signal.reason));
    const timer = setTimeout(() => finish(() => reject(new SignInError("timeout"))), ms);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      fn();
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    if (signal.aborted) abort();
  });
}

export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
