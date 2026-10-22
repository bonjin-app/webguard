import { createHash } from "node:crypto";
import { validateHeaderName, validateHeaderValue } from "node:http";
import type { IntegrityManifest } from "@webguard/integrity";
import { isPrivatePath } from "./private-path.mjs";
export interface DeploymentCheck {
  valid: boolean;
  errors: string[];
  checked: number;
}
export interface DeploymentCheckOptions {
  /** Compare actual entry, asset and probe responses with the locally generated policy. */
  expectedHeaders?: Record<string, string>;
  /** Per-request deadline, including response streaming. Default 10 seconds. */
  timeoutMs?: number;
}
/** Compare a deployment with a locally trusted manifest. Does not trust a remote manifest.
 * Header comparisons intentionally require the generated values (ignoring whitespace).
 * Network/HTTP failures are reported per request; invalid local input throws before I/O.
 */
export async function verifyDeployment(
  baseUrl: string,
  manifest: IntegrityManifest,
  removedSources: string[] = [],
  options: DeploymentCheckOptions = {},
): Promise<DeploymentCheck> {
  const base = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new Error("Deployment URL must use HTTP(S) without credentials");
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  base.search = "";
  base.hash = "";
  const timeout = options.timeoutMs ?? 10000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120000)
    throw new TypeError("timeoutMs must be an integer from 1 to 120000");
  const errors: string[] = [];
  let checked = 0;
  const safe = (path: string) => {
    if (
      typeof path !== "string" ||
      !path ||
      path.split("/").some((p) => p === ".." || p === "." || !p) ||
      /[\\?#:%]/.test(path) ||
      [...path].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      throw new Error("Unsafe deployment path");
    return new URL(path.split("/").map(encodeURIComponent).join("/"), base);
  };
  const files = Object.entries(manifest.files);
  // Resolve all paths before the first fetch; a later malformed source path must
  // not turn a partial verification into requests outside the deployment mount.
  const assets = files.map(([path, entry]) => {
    const url = safe(path);
    if (isPrivatePath(path))
      throw new Error(`Non-public deployment asset: ${path}`);
    if (
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !/^sha384-[A-Za-z0-9+/]{64}$/.test(entry.integrity)
    )
      throw new Error(`Invalid manifest entry: ${path}`);
    return { path, entry, url };
  });
  const probes = [
    ...new Set(
      [
        ...files
          .filter(([path]) => /\.[cm]?js$|\.css$/i.test(path))
          .map(([path]) => `${path}.map`),
        ...removedSources,
      ].flatMap((path) => [
        path,
        `${path}.gz`,
        `${path}.br`,
        `${path}.gz.gz`,
        `${path}.gz.br`,
        `${path}.br.gz`,
        `${path}.br.br`,
      ]),
    ),
  ].map((path) => ({ path, url: safe(path) }));
  const headers = Object.entries(options.expectedHeaders ?? {});
  const seenHeaders = new Set<string>();
  for (const [name, value] of headers) {
    validateHeaderName(name);
    if (
      typeof value !== "string" ||
      !value.trim() ||
      seenHeaders.has(name.toLowerCase())
    )
      throw new TypeError(
        "Expected headers must have unique names and non-empty string values",
      );
    validateHeaderValue(name, value);
    seenHeaders.add(name.toLowerCase());
  }
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
  const checkHeaders = (response: Response, path: string) => {
    for (const [name, expected] of headers) {
      const actual = response.headers.get(name);
      if (actual === null)
        errors.push(`Missing response header on ${path}: ${name}`);
      else if (normalize(actual) !== normalize(expected))
        errors.push(`Response header mismatch on ${path}: ${name}`);
    }
  };
  const request = async (url: URL) => {
    checked++;
    return fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    });
  };
  const compareBody = async (
    response: Response,
    path: string,
    entry: IntegrityManifest["files"][string],
  ) => {
    const hash = createHash("sha384");
    let size = 0,
      oversized = false;
    const reader = response.body?.getReader();
    try {
      if (reader)
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > entry.size) {
            oversized = true;
            await reader.cancel();
            break;
          }
          hash.update(value);
        }
    } finally {
      reader?.releaseLock();
    }
    if (oversized) errors.push(`Deployed size exceeds manifest: ${path}`);
    else if (
      size !== entry.size ||
      `sha384-${hash.digest("base64")}` !== entry.integrity
    )
      errors.push(`Deployed hash mismatch: ${path}`);
  };
  // Verify the actual mount entry independently of optional header comparisons.
  try {
    const response = await request(base);
    checkHeaders(response, "/");
    if (!response.ok)
      errors.push(
        `Deployment entry does not respond successfully (${response.status})`,
      );
    const entry = assets.find((asset) => asset.path === "index.html")?.entry;
    if (response.ok && entry) await compareBody(response, "/", entry);
    else await response.body?.cancel();
  } catch {
    errors.push("Unable to check deployment entry: /");
  }
  for (const { path, entry, url } of assets) {
    try {
      const response = await request(url);
      checkHeaders(response, path);
      if (!response.ok) {
        errors.push(`Missing deployed asset: ${path} (${response.status})`);
        await response.body?.cancel();
        continue;
      }
      await compareBody(response, path, entry);
    } catch {
      errors.push(`Unable to check deployed asset: ${path}`);
    }
  }
  for (const { path, url } of probes) {
    try {
      const response = await request(url);
      checkHeaders(response, path);
      if (response.status !== 404 && response.status !== 410)
        errors.push(
          response.ok
            ? `Source URL responds successfully (review SPA fallbacks): ${path}`
            : `Source URL absence not confirmed: ${path} (${response.status})`,
        );
      await response.body?.cancel();
    } catch {
      errors.push(`Unable to check source URL absence: ${path}`);
    }
  }
  return { valid: errors.length === 0, errors, checked };
}
