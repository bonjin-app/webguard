/** Resolves on cancellation even when a host fetch/crypto shim ignores its signal. */
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("Integrity verification aborted"));
    if (signal.aborted) {
      // Still observe the supplied operation's rejection.
      void promise.catch(() => {});
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) abort();
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** Counts decoded stream bytes; Content-Length alone cannot bound decompressed data. */
export async function readIntegrityBytes(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = response.headers.get("content-length");
  const encoding = response.headers
    .get("content-encoding")
    ?.trim()
    .toLowerCase();
  if (
    (!encoding || encoding === "identity") &&
    declared &&
    /^\d+$/.test(declared) &&
    Number(declared) > maxBytes
  )
    throw new Error("Integrity resource exceeds byte budget");
  if (!response.body) return new Uint8Array(0);
  if (typeof response.body.getReader !== "function")
    throw new Error("Bounded streaming is unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new Error("Integrity resource exceeds byte budget");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    complete = true;
    return bytes;
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
