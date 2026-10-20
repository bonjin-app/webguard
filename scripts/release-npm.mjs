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
          !/^(?:package\.json|README\.md|INSTALL\.ko\.md|LICENSE|THIRD_PARTY_NOTICES\.md|examples\/server\.mjs|dist\/[A-Za-z0-9_./-]+\.(?:js|ts))$/.test(
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
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "examples/server.mjs",
      "dist/index.js",
      "dist/index.d.ts",
      "dist/client.js",
      "dist/browser.js",
      "dist/headers.js",
    ])
      if (!paths.includes(path))
        throw new Error(`Missing public file: ${path}`);
    const target = join(release, packed.filename);
    await writeFile(target, bytes);
    const record = {
      name: pkg.name,
      version: pkg.version,
      filename: packed.filename,
      integrity: integrity(bytes),
      files: paths,
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
async function reviewed() {
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
  return { pkg, record, tarball };
}
async function publish() {
  const { pkg, record, tarball } = await reviewed();
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
      await readback();
      return;
    }
    throw new Error(
      "Version already exists with different bytes; never overwrite/unpublish",
    );
  }
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
  await readback();
}
async function readback() {
  const { pkg, record } = await reviewed();
  const published = await remote(pkg);
  const version = published?.versions?.[pkg.version];
  if (
    !version ||
    version.dist?.integrity !== record.integrity ||
    published["dist-tags"]?.latest !== pkg.version
  )
    throw new Error(
      "Registry version/latest/integrity does not match the prepared release",
    );
  const url = new URL(version.dist.tarball);
  if (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org")
    throw new Error("Unexpected registry tarball origin");
  const response = await fetch(url);
  if (
    !response.ok ||
    integrity(Buffer.from(await response.arrayBuffer())) !== record.integrity
  )
    throw new Error("Downloaded registry tarball integrity mismatch");
  const evidence = {
    checkedAt: new Date().toISOString(),
    name: pkg.name,
    version: pkg.version,
    url: `https://www.npmjs.com/package/${pkg.name}`,
    registry,
    integrity: record.integrity,
    downloadedTarballMatches: true,
    latest: published["dist-tags"].latest,
    publisher: published.maintainers.map((user) => user.name),
  };
  const output = join(root, "docs/evidence/npm-release.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
if (
  process.argv[1] &&
  (await realpath(process.argv[1]).catch(() => undefined)) ===
    fileURLToPath(import.meta.url)
) {
  const action = process.argv[2] ?? "prepare";
  try {
    if (action === "prepare") await prepare();
    else if (action === "publish") await publish();
    else if (action === "readback") await readback();
    else
      throw new Error(
        "Usage: node scripts/release-npm.mjs prepare|publish|readback",
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
