import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { obfuscate } from "../packages/obfuscator/dist/index.js";
import { publishDistribution, validateDistribution } from "./distribution.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const hash = (bytes, algorithm = "sha256") =>
  createHash(algorithm).update(bytes).digest("hex");
const run = promisify(execFile);
async function heldHash(name) {
  try {
    return hash(await readFile(join(root, ".npm-release", name)));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
const initializer = `/* WebGuard runtime setup. Host this file under your own /assets/ directory.
 * Load the pinned WebGuard SDK with defer + SRI before this external file.
 * Runtime guards do not obfuscate existing JavaScript; use the build integration.
 * Browser menus and DevTools themselves are controlled by the browser.
 */
window.webguard = WebGuardSDK.WebGuard.init({
  preset: "standard",
  devtools: {
    blockShortcuts: true,
    blockContextMenu: true,
    shortcutScope: "page",
    detect: false,
    response: "monitor"
  },
  integrity: { enabled: true }
});
window.addEventListener("pagehide", function () { window.webguard.destroy(); }, { once: true });
`;

/** Pack a separate web download candidate. Never touches the held npm release or publishes to npm. */
export async function prepareDistribution() {
  const held = ["uulab-webguard-0.3.0.tgz", "release.json"];
  const before = await Promise.all(held.map(heldHash));
  const temporary = await mkdtemp(join(tmpdir(), "webguard-public-pack-"));
  let release, failure, heldChanged;
  try {
    const pkg = JSON.parse(
      await readFile(join(root, "packages/npm/package.json"), "utf8"),
    );
    const source = await readFile(
      join(root, "packages/npm/dist/browser.global.js"),
      "utf8",
    );
    const seed = parseInt(hash(source).slice(0, 7), 16) || 1;
    const protectedSdk = (
      await obfuscate(source, {
        level: "high",
        stringArrayEncoding: "rc4",
        seed,
        reservedNames: ["^WebGuardSDK$"],
      })
    ).code;
    const context = {};
    runInNewContext(protectedSdk, context, { timeout: 10000 });
    if (typeof context.WebGuardSDK?.WebGuard?.init !== "function")
      throw new Error("Protected CDN global API is missing");
    if (/sourceMappingURL/.test(protectedSdk))
      throw new Error("CDN SDK contains source-map metadata");
    const packed = await run(
      "npm",
      ["pack", "--ignore-scripts", "--pack-destination", temporary, "--json"],
      { cwd: join(root, "packages/npm"), maxBuffer: 4 * 1024 * 1024 },
    );
    const [result] = JSON.parse(packed.stdout);
    if (
      result.name !== "uulab-webguard" ||
      result.version !== pkg.version ||
      result.filename !== `uulab-webguard-${pkg.version}.tgz`
    )
      throw new Error("Unexpected download package identity");
    const archive = await readFile(join(temporary, result.filename));
    if (
      result.integrity !==
      "sha512-" + createHash("sha512").update(archive).digest("base64")
    )
      throw new Error("Packed download integrity mismatch");
    release = await publishDistribution(join(root, "distributions"), {
      version: pkg.version,
      sdk: Buffer.from(protectedSdk + "\n"),
      packageArchive: archive,
      example: Buffer.from(initializer),
      licenses: Buffer.from(
        (await readFile(join(root, "LICENSE"), "utf8")) +
          "\n\n" +
          (await readFile(
            join(root, "packages/npm/THIRD_PARTY_NOTICES.md"),
            "utf8",
          )),
      ),
    });
    await validateDistribution(join(root, "distributions"));
    console.log(
      `Public download candidate prepared: ${release.id} (npm publication remains paused)`,
    );
  } catch (error) {
    failure = error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
    const after = await Promise.all(held.map(heldHash));
    heldChanged = JSON.stringify(before) !== JSON.stringify(after);
  }
  if (heldChanged)
    throw new Error("Held npm artifacts changed unexpectedly", {
      cause: failure,
    });
  if (failure) throw failure;
  return release;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  prepareDistribution().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
