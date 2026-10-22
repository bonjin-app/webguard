import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const sourceInputs = [
  "package.json",
  "README.md",
  "LICENSE",
  "docs/INSTALL.ko.md",
  "docs/ENVIRONMENTS.ko.md",
  "docs/licenses/javascript-obfuscator.txt",
  "examples/security-server/server.mjs",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "turbo.json",
  "scripts/package-metadata.mjs",
  "scripts/npm-metadata.mjs",
];
const stale = (message) =>
  new Error(
    `${message}; rebuild and run release:prepare again after publication resumes`,
  );
async function safeStat(root, path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid release inventory path");
  let current = root,
    stat;
  for (const part of path.split("/")) {
    current = join(current, part);
    stat = await lstat(current);
    if (stat.isSymbolicLink())
      throw new Error("Symlinks are not permitted in release inventory");
  }
  return stat;
}
async function snapshot(root, paths) {
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.length > 10000 ||
    new Set(paths).size !== paths.length
  )
    throw new Error("Invalid release inventory");
  const files = [];
  let total = 0;
  for (const path of [...paths].sort()) {
    const stat = await safeStat(root, path);
    if (
      !stat.isFile() ||
      stat.size > 8 * 1024 * 1024 ||
      (total += stat.size) > 64 * 1024 * 1024
    )
      throw new Error("Release inventory exceeds file limits");
    files.push({
      path,
      sha256: createHash("sha256")
        .update(await readFile(join(root, path)))
        .digest("hex"),
    });
  }
  return { version: 1, files };
}
export function listPackageFiles(directory) {
  const result = spawnSync(
    "npm",
    ["pack", "--dry-run", "--ignore-scripts", "--json"],
    { cwd: directory, encoding: "utf8", timeout: 180000 },
  );
  if (result.status !== 0)
    throw new Error(
      `Cannot inspect public package inventory: ${result.stderr}`,
    );
  const [pack] = JSON.parse(result.stdout);
  return pack.files.map((file) => file.path);
}
export async function capturePackageSnapshot(
  directory,
  { listFiles = listPackageFiles } = {},
) {
  return snapshot(directory, await listFiles(directory));
}
export async function captureSourceSnapshot(
  root,
  { inputs = sourceInputs } = {},
) {
  const paths = [];
  async function collect(path) {
    const stat = await safeStat(root, path);
    if (stat.isDirectory()) {
      for (const name of (await readdir(join(root, path))).sort())
        await collect(`${path}/${name}`);
    } else paths.push(path);
    if (paths.length > 10000)
      throw new Error("Release inventory exceeds file limits");
  }
  for (const path of inputs) await collect(path);
  // Include newly added packages, source files and package build configuration.
  if (inputs === sourceInputs) {
    for (const name of (await readdir(join(root, "packages"))).sort()) {
      const path = `packages/${name}`;
      if (!(await safeStat(root, path)).isDirectory()) continue;
      for (const file of (await readdir(join(root, path))).sort())
        if (
          file === "src" ||
          file === "package.json" ||
          /^(?:build\.[cm]?js|.*config\.[cm]?[jt]s)$/.test(file)
        )
          await collect(`${path}/${file}`);
    }
  }
  return snapshot(root, paths);
}
export async function assertPackageFreshness(directory, record, options = {}) {
  if (
    record.packageSnapshot?.version !== 1 ||
    !Array.isArray(record.packageSnapshot.files)
  )
    throw stale("Prepared release has no supported package snapshot");
  if (
    JSON.stringify(await capturePackageSnapshot(directory, options)) !==
    JSON.stringify(record.packageSnapshot)
  )
    throw stale("Current public package changed after preparation");
}
export async function assertSourceFreshness(root, record, options = {}) {
  if (
    record.sourceSnapshot?.version !== 1 ||
    !Array.isArray(record.sourceSnapshot.files)
  )
    throw stale("Prepared release has no supported source snapshot");
  try {
    if (
      JSON.stringify(await captureSourceSnapshot(root, options)) !==
      JSON.stringify(record.sourceSnapshot)
    )
      throw new Error("changed");
  } catch (cause) {
    throw new Error(
      stale("Current build inputs changed after preparation").message,
      { cause },
    );
  }
}
