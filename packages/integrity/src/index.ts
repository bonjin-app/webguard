import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface IntegrityManifest {
  version: 1;
  algorithm: "sha384";
  files: Record<string, { integrity: string; size: number }>;
}

// Only these root metadata files are outside the payload manifest.
const metadata = new Set(["webguard-manifest.json", "webguard-report.json"]);
const sri = /^sha384-[A-Za-z0-9+/]{64}$/;
const unsafeSegments = new Set(["__proto__", "prototype", "constructor"]);
function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\\") &&
    !Array.from(path).some(
      (char) =>
        char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === ":",
    ) &&
    path
      .split("/")
      .every(
        (part) =>
          part !== "" &&
          part !== "." &&
          part !== ".." &&
          !unsafeSegments.has(part),
      )
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function schemaErrors(value: unknown): string[] {
  if (
    !record(value) ||
    value.version !== 1 ||
    value.algorithm !== "sha384" ||
    !record(value.files)
  )
    return ["Invalid integrity manifest schema"];
  if (
    Object.keys(value).some(
      (key) => !["version", "algorithm", "files"].includes(key),
    )
  )
    return ["Invalid integrity manifest fields"];
  const errors: string[] = [],
    normalized = new Set<string>();
  for (const [path, entry] of Object.entries(value.files)) {
    const canonical = path.normalize("NFC");
    if (!safePath(path) || metadata.has(path) || normalized.has(canonical))
      errors.push(`Unsafe or duplicate manifest path: ${path}`);
    normalized.add(canonical);
    if (
      !record(entry) ||
      typeof entry.integrity !== "string" ||
      !sri.test(entry.integrity) ||
      typeof entry.size !== "number" ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      Object.keys(entry).some((key) => key !== "integrity" && key !== "size")
    )
      errors.push(`Invalid manifest entry: ${path}`);
  }
  return errors;
}

export function hashContent(content: string | Uint8Array): string {
  return `sha384-${createHash("sha384").update(content).digest("base64")}`;
}

export async function createManifest(
  directory: string,
): Promise<IntegrityManifest> {
  const source = resolve(directory);
  if (
    !(await lstat(source)).isDirectory() ||
    (await lstat(source)).isSymbolicLink()
  )
    throw new Error("Integrity root must be a regular directory");
  const root = await realpath(source);
  const files: IntegrityManifest["files"] = Object.create(null);
  const paths: string[] = [];
  async function visit(relative: string): Promise<void> {
    const entries = await readdir(join(root, relative), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (!safePath(path)) throw new Error(`Unsafe file path: ${path}`);
      const full = resolve(root, path);
      if (!full.startsWith(root + sep))
        throw new Error(`File escapes integrity root: ${path}`);
      const stat = await lstat(full);
      if (stat.isSymbolicLink())
        throw new Error(`Symbolic link is not allowed: ${path}`);
      if (stat.isDirectory()) await visit(path);
      else if (stat.isFile()) {
        if (!metadata.has(path)) paths.push(path);
      } else throw new Error(`Unsupported file type: ${path}`);
    }
  }
  await visit("");
  const normalized = new Set<string>();
  for (const path of paths.sort()) {
    const canonical = path.normalize("NFC");
    if (normalized.has(canonical))
      throw new Error(`Duplicate normalized file path: ${path}`);
    normalized.add(canonical);
    const handle = await open(
      join(root, path),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      if (!(await handle.stat()).isFile())
        throw new Error(`Unsupported file type: ${path}`);
      const bytes = await handle.readFile();
      files[path] = { integrity: hashContent(bytes), size: bytes.length };
    } finally {
      await handle.close();
    }
  }
  return { version: 1, algorithm: "sha384", files };
}

export async function verifyManifest(
  directory: string,
  manifest: unknown,
): Promise<{ valid: boolean; errors: string[] }> {
  const errors = schemaErrors(manifest);
  if (errors.length) return { valid: false, errors };
  let actual: IntegrityManifest;
  try {
    actual = await createManifest(directory);
  } catch {
    return {
      valid: false,
      errors: [
        "Unable to safely read integrity directory (missing, unreadable, or symbolic-link entry)",
      ],
    };
  }
  const expected = manifest as IntegrityManifest;
  for (const [path, entry] of Object.entries(expected.files)) {
    const current = actual.files[path];
    if (!current) errors.push(`Missing file: ${path}`);
    else if (
      current.integrity !== entry.integrity ||
      current.size !== entry.size
    )
      errors.push(`Changed file: ${path}`);
  }
  for (const path of Object.keys(actual.files)) {
    if (!Object.hasOwn(expected.files, path))
      errors.push(`Unexpected file: ${path}`);
  }
  return { valid: errors.length === 0, errors };
}
