export type IdentificationFailure =
  | "quota" | "rate_limit" | "unavailable" | "transport" | "timeout"
  | "invalid_response" | "credentials" | "configuration"
  | "invalid_image" | "unsupported_input" | "app_limit";

// Messages and fields on these errors are safe to send/log. Never attach raw
// fetch errors: Pl@ntNet's documented URL contains its API key.
export class IdentificationServiceError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus: number,
    readonly category: IdentificationFailure,
    readonly retryable = false,
    readonly retryAfterMs = 600,
  ) {
    super(message);
    this.name = "IdentificationServiceError";
  }
}

// Settle even if a transport ignores abort, and abort the actual request too.
// Body reading/parsing belongs inside operation so it shares the same deadline.
export async function withinProviderDeadline<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutError: () => IdentificationServiceError,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(timeoutError());
      controller.abort();
    }, Math.max(0, timeoutMs));
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      stopped,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
