import {
  capturePackageSnapshot,
  captureSourceSnapshot,
  assertPackageFreshness,
  assertSourceFreshness,
} from "./release-freshness.mjs";
import { verifyRegistryRelease } from "./release-readback.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rm,
  mkdtemp,
  realpath,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const registry = "https://registry.npmjs.org";
const release = join(root, ".npm-release");
const directory = join(root, "packages/npm");
const expectedName = "uulab-webguard";
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 180000,
    env: process.env,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stderr}\n${result.stdout}`,
    );
  return result.stdout.trim();
}
async function metadata() {
  const pkg = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  );
  if (
    pkg.name !== expectedName ||
    !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(pkg.version)
  )
    throw new Error("Unexpected public package name/version");
  if (
    pkg.private ||
    pkg.publishConfig?.access !== "public" ||
    pkg.publishConfig?.registry !== registry
  )
    throw new Error("Public registry/access must be explicit");
  if (
    pkg.bin?.["webguard-check"] !== "./dist/check.js" ||
    pkg.bin?.["webguard-serve"] !== "./dist/serve.js"
  )
    throw new Error(
      "Public package must expose webguard-check and webguard-serve",
    );
  for (const [name, value] of Object.entries(pkg.dependencies ?? {}))
    if (name.startsWith("@webguard/") || /workspace:|file:|link:/.test(value))
      throw new Error(`Unpublished runtime dependency: ${name}`);
  if (
    Object.keys(pkg.scripts ?? {}).some((name) =>
      /^(?:preinstall|install|postinstall|prepare|prepublishOnly)$/.test(name),
    )
  )
    throw new Error(
      "Public package must not execute installation/publication hooks",
    );
  return pkg;
}
const integrity = (bytes) =>
  "sha512-" + createHash("sha512").update(bytes).digest("base64");
async function remote(pkg) {
  const response = await fetch(`${registry}/${encodeURIComponent(pkg.name)}`);
  if (response.status === 404) return undefined;
  if (!response.ok)
    throw new Error(`Registry lookup failed: ${response.status}`);
  return response.json();
}
async function prepare() {
  const pkg = await metadata();
  const sourceSnapshot = await captureSourceSnapshot(root);
  const packageSnapshot = await capturePackageSnapshot(directory);
  await mkdir(release, { recursive: true });
  const stage = await mkdtemp(join(release, "stage-"));
  try {
    const [packed] = JSON.parse(
      run(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", stage],
        directory,
      ),
    );
    const bytes = await readFile(join(stage, packed.filename));
    if (
      packed.name !== pkg.name ||
      packed.version !== pkg.version ||
      packed.integrity !== integrity(bytes)
    )
      throw new Error("Packed package identity/integrity mismatch");
    const paths = packed.files.map((file) => file.path);
    if (
      paths.some(
        (path) =>
          !/^(?:package\.json|README\.md|INSTALL\.ko\.md|ENVIRONMENTS\.ko\.md|API(?:_BROWSER|_BUILD|_INTEGRATIONS)?\.ko\.md|LICENSE|THIRD_PARTY_NOTICES\.md|examples\/server\.mjs|dist\/[A-Za-z0-9_./-]+\.(?:js|ts))$/.test(
            path,
          ) ||
          path.endsWith(".map") ||
          path.split("/").some((part) => part.startsWith(".")),
      )
    )
      throw new Error("Unexpected file in public package");
    for (const path of [
      "README.md",
      "INSTALL.ko.md",
      "ENVIRONMENTS.ko.md",
      "API.ko.md",
      "API_BROWSER.ko.md",
      "API_BUILD.ko.md",
      "API_INTEGRATIONS.ko.md",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "examples/server.mjs",
      "dist/index.js",
      "dist/index.d.ts",
      "dist/client.js",
      "dist/browser.js",
      "dist/browser.global.js",
      "dist/build.js",
      "dist/build.d.ts",
      "dist/next.js",
      "dist/next.d.ts",
      "dist/next-runtime.js",
      "dist/cli.js",
      "dist/headers.js",
      "dist/verify.js",
      "dist/verify.d.ts",
      "dist/check.js",
      "dist/server.js",
      "dist/server.d.ts",
      "dist/serve.js",
    ])
      if (!paths.includes(path))
        throw new Error(`Missing public file: ${path}`);
    // Verify the exact archived bytes against the reviewed current file snapshot.
    run("tar", ["-xzf", join(stage, packed.filename), "-C", stage]);
    const archived = await capturePackageSnapshot(join(stage, "package"), {
      listFiles: () => paths,
    });
    if (JSON.stringify(archived) !== JSON.stringify(packageSnapshot))
      throw new Error(
        "Packed files differ from current public package snapshot",
      );
    await assertPackageFreshness(directory, { packageSnapshot });
    await assertSourceFreshness(root, { sourceSnapshot });
    const target = join(release, packed.filename);
    await writeFile(target, bytes);
    const record = {
      name: pkg.name,
      version: pkg.version,
      filename: packed.filename,
      integrity: integrity(bytes),
      files: paths,
      packageSnapshot,
      sourceSnapshot,
      preparedAt: new Date().toISOString(),
    };
    await writeFile(
      join(release, "release.json"),
      JSON.stringify(record, null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        { ...record, files: paths.length, tarball: target },
        null,
        2,
      ),
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
async function reviewed({ freshness = false } = {}) {
  const pkg = await metadata();
  const record = JSON.parse(
    await readFile(join(release, "release.json"), "utf8"),
  );
  if (
    record.name !== pkg.name ||
    record.version !== pkg.version ||
    record.filename !== `${pkg.name}-${pkg.version}.tgz`
  )
    throw new Error("Prepared release differs; run release:prepare again");
  const tarball = join(release, record.filename);
  if (integrity(await readFile(tarball)) !== record.integrity)
    throw new Error("Prepared tarball changed after review");
  if (freshness) {
    await assertPackageFreshness(directory, record);
    await assertSourceFreshness(root, record);
    if (
      JSON.stringify([...record.files].sort()) !==
      JSON.stringify(record.packageSnapshot.files.map((file) => file.path))
    )
      throw new Error(
        "Prepared file inventory differs from snapshot; run release:prepare again",
      );
  }
  return { pkg, record, tarball };
}
export async function check() {
  const { pkg, tarball } = await reviewed({ freshness: true });
  console.log(
    JSON.stringify({
      status: "fresh",
      name: pkg.name,
      version: pkg.version,
      tarball,
    }),
  );
}
export async function publish(readbackOptions = {}) {
  const { pkg, record, tarball } = await reviewed({ freshness: true });
  const publisher = run("npm", ["whoami", `--registry=${registry}`]);
  const existing = await remote(pkg);
  if (
    existing &&
    !existing.maintainers?.some((user) => user.name === publisher)
  )
    throw new Error("Existing package is owned by another publisher");
  if (existing?.versions?.[pkg.version]) {
    if (existing.versions[pkg.version].dist?.integrity === record.integrity) {
      console.log(
        "Reviewed package is already published with identical integrity.",
      );
      return readback(readbackOptions);
    }
    throw new Error(
      "Version already exists with different bytes; never overwrite/unpublish",
    );
  }
  // Authentication/registry checks may take time. Pin the candidate selected before them.
  const confirmed = await reviewed({ freshness: true });
  if (JSON.stringify(confirmed.record) !== JSON.stringify(record))
    throw new Error(
      "Prepared release record changed during publication checks; review the candidate again",
    );
  // The exact prepared tarball is the only publish target. Authentication stays in npm.
  const result = spawnSync(
    "npm",
    [
      "publish",
      tarball,
      "--access",
      "public",
      "--tag",
      "latest",
      "--ignore-scripts",
      `--registry=${registry}`,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error("npm publication did not complete");
  console.log(
    "npm publish completed successfully. Only registry readback will be retried.",
  );
  try {
    return await readback(readbackOptions);
  } catch (cause) {
    throw new Error(
      `npm publish succeeded, but registry readback is ${cause.status ?? "unconfirmed"}. Do not publish again. Run node scripts/release-npm.mjs readback. ${cause.message}`,
      { cause },
    );
  }
}
export async function readback(options = {}) {
  const { pkg, record } = await reviewed();
  let verified;
  try {
    verified = await verifyRegistryRelease(
      { name: pkg.name, version: pkg.version, integrity: record.integrity },
      {
        onRetry: (state) =>
          console.warn(
            `Registry readback ${state.code}: retry ${state.nextAttempt} after ${state.delayMs}ms. Publication will not be repeated.`,
          ),
        ...options,
      },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        status: error.status ?? "failed",
        name: pkg.name,
        version: pkg.version,
        reason: error.code ?? "READBACK_ERROR",
        attempts: error.attempts ?? 0,
        operation: "readback",
        publicationRetried: false,
        evidenceWritten: false,
      }),
    );
    throw error;
  }
  const { published } = verified;
  const evidence = {
    status: "verified",
    attempts: verified.attempts,
    checkedAt: new Date().toISOString(),
    name: pkg.name,
    version: pkg.version,
    url: `https://www.npmjs.com/package/${pkg.name}`,
    registry,
    integrity: record.integrity,
    downloadedTarballMatches: true,
    latest: published["dist-tags"].latest,
    publisher: (published.maintainers ?? []).map((user) => user.name),
  };
  const output = join(root, "docs/evidence/npm-release.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
  return evidence;
}
if (
  process.argv[1] &&
  (await realpath(process.argv[1]).catch(() => undefined)) ===
    fileURLToPath(import.meta.url)
) {
  const action = process.argv[2] ?? "prepare";
  try {
    if (action === "prepare") await prepare();
    else if (action === "check") await check();
    else if (action === "publish") await publish();
    else if (action === "readback") await readback();
    else
      throw new Error(
        "Usage: node scripts/release-npm.mjs prepare|check|publish|readback",
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
