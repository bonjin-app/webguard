import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Pack once without lifecycle hooks. Never prepare or publish a release candidate.
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
let requireNativeRuntimes = false;
let providedTarball;
let evidenceDirectory;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--require-native-runtimes" && !requireNativeRuntimes)
    requireNativeRuntimes = true;
  else if (
    arg === "--tarball" &&
    !providedTarball &&
    args[index + 1] &&
    !args[index + 1].startsWith("--")
  )
    providedTarball = resolve(args[++index]);
  else if (!arg.startsWith("--") && !evidenceDirectory) evidenceDirectory = arg;
  else
    throw new Error(
      "Usage: pnpm test:consumers [--require-native-runtimes] [--tarball PATH] [EVIDENCE_DIRECTORY]",
    );
}
const evidence = resolve(
  evidenceDirectory ?? join(root, "test-results/consumers"),
);
const directory = await mkdtemp(join(tmpdir(), "webguard-installations-"));
const digest = (bytes) => createHash("sha512").update(bytes).digest("hex");
const metadata = JSON.parse(
  await readFile(join(root, "packages/npm/package.json"), "utf8"),
);
const candidateFilename = `${metadata.name}-${metadata.version}.tgz`;
const heldFiles = [
  ".npm-release/release.json",
  `.npm-release/${candidateFilename}`,
];
async function heldSnapshot() {
  return Promise.all(
    heldFiles.map(async (file) => {
      try {
        return digest(await readFile(join(root, file)));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }),
  );
}
const before = await heldSnapshot();
const receipt = {
  status: "running",
  checkedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  packageSha512: null,
  packageSource: providedTarball ? "provided-tarball" : "temporary-pack",
  scope:
    "Vite 7/8, generic and Next install one temporary tarball; SSR templates use the workspace build. Browser engines are desktop automation, not physical-device certification.",
  suites: [],
  heldReleaseUnchanged: null,
  requireNativeRuntimes,
};
await mkdir(evidence, { recursive: true });
const save = () =>
  writeFile(
    join(evidence, "installations.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
async function run(parameters) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, parameters, {
      cwd: root,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`${parameters[0]} failed (${signal ?? code})`)),
    );
  });
}
let failure;
try {
  await save();
  let tarball = providedTarball;
  if (!tarball) {
    const { stdout } = await promisify(execFile)(
      "npm",
      ["pack", "--ignore-scripts", "--pack-destination", directory, "--json"],
      {
        cwd: join(root, "packages/npm"),
        timeout: 60000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const [packed] = JSON.parse(stdout);
    if (!packed || packed.filename !== candidateFilename)
      throw new Error("Unexpected package candidate");
    tarball = join(directory, packed.filename);
  }
  receipt.packageSha512 = digest(await readFile(tarball));
  const suites = [
    ["vite7", "scripts/verify-npm-consumer.mjs", "--vite", "7.3.1"],
    ["vite8", "scripts/verify-runtime-consumer.mjs"],
    ["generic", "scripts/verify-generic-consumer.mjs"],
    ["next", "scripts/verify-next-consumer.mjs"],
    ["ssr", "scripts/verify-ssr-templates.mjs"],
  ];
  for (const [name, script, ...extra] of suites) {
    const item = { name, status: "running" };
    receipt.suites.push(item);
    await save();
    try {
      await run([
        script,
        ...(name === "ssr" ? [] : ["--tarball", tarball]),
        ...(name === "ssr" && requireNativeRuntimes
          ? ["--require-native-runtimes"]
          : []),
        ...extra,
        "--evidence",
        join(evidence, `${name}.json`),
      ]);
      if (digest(await readFile(tarball)) !== receipt.packageSha512)
        throw new Error("Candidate changed during verification");
      if (name === "ssr") {
        const details = JSON.parse(
          await readFile(join(evidence, `${name}.json`), "utf8"),
        );
        item.skipped = details.skipped ?? [];
        if (
          !["passed", "passed-with-skips"].includes(details.status) ||
          (requireNativeRuntimes && item.skipped.length)
        )
          throw new Error("SSR acceptance did not satisfy the runtime policy");
      }
      item.status = item.skipped?.length ? "passed-with-skips" : "passed";
    } catch (error) {
      item.status = "failed";
      throw error;
    }
    await save();
  }
  receipt.status = receipt.suites.some((suite) => suite.skipped?.length)
    ? "passed-with-skips"
    : "passed";
} catch (error) {
  receipt.status = "failed";
  failure = error;
} finally {
  receipt.heldReleaseUnchanged =
    JSON.stringify(before) === JSON.stringify(await heldSnapshot());
  if (!receipt.heldReleaseUnchanged) receipt.status = "failed";
  await save();
  await rm(directory, { recursive: true, force: true });
}
if (!receipt.heldReleaseUnchanged)
  throw new Error("Held release artifacts changed", { cause: failure });
if (failure) throw failure;
