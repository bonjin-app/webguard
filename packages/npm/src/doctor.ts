import { lstat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { verifyManifest, type IntegrityManifest } from "@webguard/integrity";
import {
  readLocalCheckJson,
  validateHeaderPolicy,
} from "../../cli/src/check.js";

type Check = {
  id: "directory" | "manifest" | "assets" | "headers";
  status: "passed" | "failed";
  message: string;
  nextAction?: string;
};
export interface StaticBuildDiagnosis {
  version: 1;
  scope: "local-static-build";
  status: "passed" | "failed";
  checks: Check[];
  limitations: string[];
}

/** Read-only static output validation. Never loads project configuration or contacts a host. */
export async function diagnoseStaticBuild(
  directory: string,
): Promise<StaticBuildDiagnosis> {
  const checks: Check[] = [];
  const result = (): StaticBuildDiagnosis => ({
    version: 1,
    scope: "local-static-build",
    status: checks.some((check) => check.status === "failed")
      ? "failed"
      : "passed",
    checks,
    limitations: [
      "Local checks do not verify runtime compatibility, business authorization or deployed HTTP headers.",
      "A locally stored manifest is a comparison baseline, not independent proof of authenticity or obfuscation strength.",
      "Apply the generated HTTP headers on your host and verify the deployment separately.",
    ],
  });
  const root = resolve(directory);
  try {
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
    if (
      root.split(sep).includes(".next") ||
      (await lstat(join(root, "BUILD_ID")).then(
        () => true,
        () => false,
      ))
    ) {
      checks.push({
        id: "directory",
        status: "failed",
        message: "Next.js server output is outside this static build check.",
        nextAction:
          "Use the Next.js integration and verify its server and browser runtime. For static export, check the protected export directory instead of .next.",
      });
      return result();
    }
    checks.push({
      id: "directory",
      status: "passed",
      message: "Static output directory is accessible.",
    });
  } catch {
    checks.push({
      id: "directory",
      status: "failed",
      message:
        "Build directory is missing, unreadable or not a regular directory.",
      nextAction:
        "Run your production build, then check its protected output directory (Vite defaults to dist). Do not pass the source directory or a symlink.",
    });
    return result();
  }
  let manifest: unknown;
  try {
    manifest = await readLocalCheckJson(root, "webguard-manifest.json");
    checks.push({
      id: "manifest",
      status: "passed",
      message:
        "Local manifest was read; schema and file hashes are checked below.",
    });
  } catch {
    checks.push({
      id: "manifest",
      status: "failed",
      message: "Protection manifest is missing, unreadable or invalid JSON.",
      nextAction:
        "Enable the WebGuard Vite plugin and rebuild, or use webguard protect-app INPUT --output OUTPUT, then check OUTPUT. Never create a replacement manifest to approve altered files.",
    });
  }
  if (manifest !== undefined) {
    try {
      const verified = await verifyManifest(root, manifest);
      if (!verified.valid) throw new Error();
      const files = Object.keys((manifest as IntegrityManifest).files);
      if (
        !files.some((path) => /\.html?$/i.test(path)) ||
        !files.some((path) => /\.[cm]?js$/i.test(path))
      )
        throw new Error();
      checks.push({
        id: "assets",
        status: "passed",
        message:
          "Manifest schema and final asset hashes match; static HTML and JavaScript are present.",
      });
    } catch {
      checks.push({
        id: "assets",
        status: "failed",
        message:
          "Asset verification failed: invalid manifest, missing, changed or extra files, unsafe paths, or no static HTML/JavaScript entry.",
        nextAction:
          "Rebuild from trusted source into fresh output and check the final directory. Keep private artifacts outside it; do not rewrite the manifest to accept tampering.",
      });
    }
  }
  try {
    validateHeaderPolicy(
      await readLocalCheckJson(root, "webguard-headers.json"),
    );
    checks.push({
      id: "headers",
      status: "passed",
      message:
        "Generated header policy has valid names and values, Content-Security-Policy and nosniff.",
    });
  } catch {
    checks.push({
      id: "headers",
      status: "failed",
      message: "Generated header policy is missing, unreadable or invalid.",
      nextAction:
        "Generate headers with the WebGuard plugin or protect-app (without --no-headers). Apply webguard-headers.json on your host and separately inspect the deployed HTTP response.",
    });
  }
  return result();
}

export function formatDiagnosis(result: StaticBuildDiagnosis): string {
  return [
    result.status === "passed"
      ? "WebGuard: Local check passed."
      : "WebGuard: Local check failed.",
    ...result.checks.flatMap((check) => [
      `${check.status === "passed" ? "PASS" : "FAIL"} ${check.id}: ${check.message}`,
      ...(check.nextAction ? [`Next: ${check.nextAction}`] : []),
    ]),
    ...result.limitations,
  ].join("\n");
}
