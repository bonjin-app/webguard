import { createHash } from "node:crypto";

const registry = "https://registry.npmjs.org";
const defaultDelays = [500, 1000, 2000, 4000, 8000];
class ReadbackError extends Error {
  constructor(code, message, retryable = false, cause) {
    super(message, cause ? { cause } : undefined);
    this.code = code;
    this.retryable = retryable;
    this.status = retryable
      ? "unconfirmed"
      : code.includes("INTEGRITY_MISMATCH")
        ? "mismatch"
        : "failed";
  }
}
const integrity = (bytes) =>
  "sha512-" + createHash("sha512").update(bytes).digest("base64");

/** Only reads registry state. Publication is deliberately outside this retry boundary. */
export async function verifyRegistryRelease(
  target,
  {
    fetch: fetchRegistry = globalThis.fetch,
    wait = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    delays = defaultDelays,
    onRetry = () => {},
    requestTimeoutMs = 10000,
  } = {},
) {
  if (
    !Array.isArray(delays) ||
    delays.length > 10 ||
    delays.some(
      (delay) => !Number.isFinite(delay) || delay < 0 || delay > 30000,
    )
  )
    throw new TypeError("Invalid bounded readback delays");
  if (
    !Number.isInteger(requestTimeoutMs) ||
    requestTimeoutMs <= 0 ||
    requestTimeoutMs > 60000
  )
    throw new TypeError("Invalid readback request timeout");
  const fetchResponse = async (url, stage) => {
    let response;
    try {
      response = await fetchRegistry(url, {
        redirect: "error",
        signal: globalThis.AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (cause) {
      throw new ReadbackError(
        "NETWORK_ERROR",
        `Registry ${stage} could not be reached`,
        true,
        cause,
      );
    }
    // Error bodies are never inspected. Release the stream before classifying the
    // status, so both retries and permanent failures leave no response outstanding.
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        /* Preserve the HTTP classification if transport cleanup also fails. */
      }
    }
    if (
      response.status === 429 ||
      (response.status >= 500 && response.status <= 599)
    )
      throw new ReadbackError(
        "TRANSIENT_REGISTRY_ERROR",
        `Registry ${stage} returned HTTP ${response.status}`,
        true,
      );
    return response;
  };
  const inspect = async () => {
    const response = await fetchResponse(
      `${registry}/${encodeURIComponent(target.name)}`,
      "metadata",
    );
    if (response.status === 404)
      throw new ReadbackError(
        "VERSION_PENDING",
        `Registry has not exposed ${target.name}@${target.version} yet`,
        true,
      );
    if (!response.ok)
      throw new ReadbackError(
        "REGISTRY_HTTP_ERROR",
        `Registry metadata returned HTTP ${response.status}`,
      );
    let published;
    try {
      published = await response.json();
    } catch (cause) {
      // JSON syntax is definitive invalid metadata; other failures are interrupted body reads.
      const interrupted = cause?.name !== "SyntaxError";
      throw new ReadbackError(
        interrupted ? "NETWORK_ERROR" : "INVALID_REGISTRY_RESPONSE",
        interrupted
          ? "Registry metadata download was interrupted"
          : "Registry metadata is not valid JSON",
        interrupted,
        cause,
      );
    }
    if (!published || typeof published !== "object" || Array.isArray(published))
      throw new ReadbackError(
        "INVALID_REGISTRY_RESPONSE",
        "Registry metadata must be an object",
      );
    const version = published.versions?.[target.version];
    if (!version)
      throw new ReadbackError(
        "VERSION_PENDING",
        `Registry has not exposed version ${target.version} yet`,
        true,
      );
    if (typeof version.dist?.integrity !== "string")
      throw new ReadbackError(
        "INVALID_REGISTRY_RESPONSE",
        "Published version is missing dist.integrity",
      );
    // Check bytes before tags: another artifact with this version is never eventual consistency.
    if (version.dist.integrity !== target.integrity)
      throw new ReadbackError(
        "REGISTRY_INTEGRITY_MISMATCH",
        "The registry version contains different bytes from the reviewed tarball; stop and investigate",
      );
    if (published["dist-tags"]?.latest !== target.version)
      throw new ReadbackError(
        "LATEST_PENDING",
        `Registry latest is ${published["dist-tags"]?.latest ?? "not visible"}; expected ${target.version}`,
        true,
      );
    let url;
    try {
      url = new URL(version.dist.tarball);
    } catch (cause) {
      throw new ReadbackError(
        "UNEXPECTED_TARBALL_ORIGIN",
        "Published tarball URL is invalid",
        false,
        cause,
      );
    }
    if (url.origin !== registry || url.username || url.password)
      throw new ReadbackError(
        "UNEXPECTED_TARBALL_ORIGIN",
        "Unexpected registry tarball origin",
      );
    const downloaded = await fetchResponse(url, "tarball");
    if (!downloaded.ok)
      throw new ReadbackError(
        "TARBALL_HTTP_ERROR",
        `Registry tarball returned HTTP ${downloaded.status}`,
      );
    let bytes;
    try {
      bytes = Buffer.from(await downloaded.arrayBuffer());
    } catch (cause) {
      throw new ReadbackError(
        "NETWORK_ERROR",
        "Registry tarball download was interrupted",
        true,
        cause,
      );
    }
    if (integrity(bytes) !== target.integrity)
      throw new ReadbackError(
        "TARBALL_INTEGRITY_MISMATCH",
        "Downloaded registry tarball differs from the reviewed bytes; stop and investigate",
      );
    return { published, url: url.href, downloadedTarballMatches: true };
  };
  for (let attempt = 1; attempt <= delays.length + 1; attempt++) {
    try {
      return { ...(await inspect()), status: "verified", attempts: attempt };
    } catch (error) {
      if (!(error instanceof ReadbackError)) throw error;
      error.attempts = attempt;
      if (!error.retryable) throw error;
      if (attempt > delays.length) {
        error.message = `Registry readback remains unconfirmed after ${attempt} attempts: ${error.message}. Retry node scripts/release-npm.mjs readback later; do not repeat npm publish.`;
        throw error;
      }
      const delay = delays[attempt - 1];
      onRetry({
        attempt,
        nextAttempt: attempt + 1,
        delayMs: delay,
        code: error.code,
        message: error.message,
      });
      await wait(delay);
    }
  }
}
