import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { verifyManifest, type IntegrityManifest } from "@webguard/integrity";
import { verifyDeployment, type DeploymentCheck } from "./remote.js";

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function readJson(directory: string, filename: string): Promise<unknown> {
  const handle = await open(
    join(directory, filename),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    if (!(await handle.stat()).isFile())
      throw new Error("Metadata must be a regular file");
    return JSON.parse(await handle.readFile("utf8")) as unknown;
  } finally {
    await handle.close();
  }
}
function headerPolicy(input: unknown): Record<string, string> {
  if (!object(input))
    throw new Error(
      "webguard-headers.json must be a header-name/string record",
    );
  const headers: Record<string, string> = Object.create(null);
  for (const [name, value] of Object.entries(input)) {
    const lower = name.toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      typeof value !== "string" ||
      !value.trim() ||
      [...value].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      Object.hasOwn(headers, lower)
    ) {
      throw new Error(
        "webguard-headers.json contains an invalid or duplicate header",
      );
    }
    headers[lower] = value.trim();
  }
  if (
    !headers["content-security-policy"] ||
    headers["x-content-type-options"]?.toLowerCase() !== "nosniff"
  ) {
    throw new Error(
      "webguard-headers.json requires Content-Security-Policy and X-Content-Type-Options: nosniff",
    );
  }
  return headers;
}
function reportPaths(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (path) =>
        typeof path !== "string" ||
        !path ||
        /[\\%?#:]/.test(path) ||
        [...path].some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        ) ||
        path
          .split("/")
          .some((segment) => !segment || segment === "." || segment === ".."),
    )
  ) {
    throw new Error(
      "webguard-report.json removedSources and removedMaps must be arrays of safe relative paths",
    );
  }
  return value as string[];
}
function localFailure(message: string): DeploymentCheck {
  return { valid: false, errors: [message], checked: 0 };
}

/** Verify trusted local output first, then compare deployed bytes, headers and hidden URLs. */
export async function checkDeployment(
  directory: string,
  baseUrl: string,
): Promise<DeploymentCheck> {
  let manifest: unknown;
  try {
    manifest = await readJson(directory, "webguard-manifest.json");
  } catch {
    return localFailure("Unable to read a valid local webguard-manifest.json");
  }
  const local = await verifyManifest(directory, manifest);
  if (!local.valid) return { ...local, checked: 0 };
  let headers: Record<string, string>;
  try {
    headers = headerPolicy(await readJson(directory, "webguard-headers.json"));
  } catch (error) {
    return localFailure(
      error instanceof Error &&
        error.message.startsWith("webguard-headers.json")
        ? error.message
        : "Unable to read a valid local webguard-headers.json",
    );
  }
  const probes = ["webguard-report.json", "webguard-headers.json", "_headers"];
  try {
    let report: unknown;
    try {
      report = await readJson(directory, "webguard-report.json");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (report !== undefined) {
      if (!object(report)) throw new Error("Invalid report");
      probes.push(
        ...reportPaths(report.removedSources),
        ...reportPaths(report.removedMaps),
      );
    }
  } catch {
    return localFailure(
      "Invalid local webguard-report.json: removedSources and removedMaps must be arrays of safe relative paths",
    );
  }
  try {
    const url = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Invalid URL");
  } catch {
    return localFailure(
      "Deployment URL must be an HTTP(S) URL without embedded credentials",
    );
  }
  try {
    return await verifyDeployment(
      baseUrl,
      manifest as IntegrityManifest,
      probes,
      { expectedHeaders: headers },
    );
  } catch (error) {
    return localFailure(
      error instanceof Error &&
        error.message.startsWith("Non-public deployment asset:")
        ? error.message
        : "Deployment verification request failed",
    );
  }
}
