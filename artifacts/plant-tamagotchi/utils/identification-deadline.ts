// Backend analysis has a 45-second total budget. Leave 10 seconds for image
// upload and the response to travel through the proxy/mobile connection.
export const IDENTIFICATION_CLIENT_TIMEOUT_MS = 55_000;

export class IdentificationTimeoutError extends Error {
  constructor() {
    super('Plant identification took too long. Please try again; your photo is still saved.');
    this.name = 'IdentificationTimeoutError';
  }
}

function canceledError() {
  const error = new Error('Plant identification was canceled.');
  error.name = 'AbortError';
  return error;
}

// Abort the network request AND settle the caller even if a platform's fetch
// fails to reject promptly on abort. Never leave the loading indicator stuck.
export async function withIdentificationDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  controller: AbortController,
  timeoutMs = IDENTIFICATION_CLIENT_TIMEOUT_MS,
): Promise<T> {
  if (controller.signal.aborted) throw canceledError();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => rejectCanceled(canceledError());
  let rejectCanceled: (error: Error) => void = () => {};
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectCanceled = reject;
    controller.signal.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => {
      reject(new IdentificationTimeoutError());
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      stopped,
    ]);
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
