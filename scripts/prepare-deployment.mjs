import {
  createManifest,
  verifyManifest,
} from "../packages/integrity/dist/index.js";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { validateHeaderName, validateHeaderValue } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { validateDistribution } from "./distribution.mjs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const mounts = [
  ["playground", "/"],
  ["docs", "/docs/"],
  ["react", "/examples/react/"],
  ["vanilla-js", "/examples/vanilla-js/"],
  ["vanilla-ts", "/examples/vanilla-ts/"],
];
const publicExtensions = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".wasm",
  ".txt",
]);
const controls = new Set([
  "webguard-report.json",
  "webguard-headers.json",
  "webguard-manifest.json",
  "_headers",
]);
const forbiddenSegments = new Set([
  "src",
  "server",
  "node_modules",
  "test",
  "tests",
  "__tests__",
  "coverage",
  "private",
  "__proto__",
  "prototype",
  "constructor",
]);
function safeSegments(path) {
  return path
    .split("/")
    .every(
      (part) =>
        /^[A-Za-z0-9_][A-Za-z0-9_.~-]*$/.test(part) &&
        !forbiddenSegments.has(part.toLowerCase()),
    );
}
function publicFile(path) {
  const name = basename(path).toLowerCase();
  if (
    controls.has(name) ||
    !safeSegments(path) ||
    /(?:^|[.-])config\./i.test(name) ||
    /^package(?:-lock)?\.json$/i.test(name)
  )
    return false;
  if (name === "third-party-licenses.md") return true;
  const extension = extname(path).toLowerCase();
  if (!publicExtensions.has(extension)) return false;
  // Executable JavaScript and JSON data must be build assets, never root server/config files.
  if (
    [".js", ".mjs", ".json"].includes(extension) &&
    !path.startsWith("assets/")
  )
    return false;
  return true;
}
const inside = (root, path) => {
  const part = relative(root, path);
  return !isAbsolute(part) && part !== ".." && !part.startsWith(".." + sep);
};
// Resolve the nearest existing ancestor without creating missing directories.
async function canonicalPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(await canonicalPath(parent), relative(parent, path));
  }
}
async function headersFor(directory) {
  const value = JSON.parse(
    await readFile(join(directory, "webguard-headers.json"), "utf8"),
  );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid deployment header policy");
  const headers = Object.create(null);
  for (const [name, text] of Object.entries(value)) {
    validateHeaderName(name);
    if (typeof text !== "string" || !text.trim())
      throw new Error("Invalid deployment header value");
    validateHeaderValue(name, text);
    const key = name.toLowerCase();
    if (
      Object.hasOwn(headers, key) ||
      [
        "connection",
        "content-length",
        "transfer-encoding",
        "trailer",
        "upgrade",
      ].includes(key)
    )
      throw new Error("Invalid deployment header name");
    headers[key] = text;
  }
  if (!headers["content-security-policy"])
    throw new Error("Deployment requires Content-Security-Policy");
  headers["x-content-type-options"] = "nosniff";
  return headers;
}
/** Prepare only trusted built assets. No network, accounts, or deployment side effects. */
export async function prepareDeployment(
  inputDirectory = join(repository, ".demo-dist"),
  outputDirectory = join(repository, ".cloudflare-dist"),
) {
  const source = resolve(inputDirectory);
  if (
    !(await lstat(source)).isDirectory() ||
    (await lstat(source)).isSymbolicLink()
  )
    throw new Error("Deployment input must be a real directory");
  const input = await realpath(source);
  const requestedOutput = resolve(outputDirectory);
  const canonicalOutput = await canonicalPath(requestedOutput);
  // Preserve publication semantics for a destination symlink: replace the link,
  // while still checking both its target and its directory entry for overlap.
  const output = join(
    await canonicalPath(dirname(requestedOutput)),
    basename(requestedOutput),
  );
  if (
    [output, canonicalOutput].some(
      (path) => inside(input, path) || inside(path, input),
    )
  )
    throw new Error("Deployment input and output must be separate");
  await mkdir(dirname(output), { recursive: true });
  const stage = await mkdtemp(join(dirname(output), ".deployment-stage-"));
  const backup = join(dirname(output), `.deployment-backup-${randomUUID()}`);
  try {
    const manifest = { version: 1, mounts: [], assets: Object.create(null) };
    const publicRoot = join(stage, "public");
    await mkdir(publicRoot);
    const add = (url, path, mount, headers) => {
      if (Object.hasOwn(manifest.assets, url))
        throw new Error(`Duplicate deployment URL: ${url}`);
      manifest.assets[url] = { path, mount, ...(headers ? { headers } : {}) };
    };
    for (const [name, prefix] of mounts) {
      const directory = join(input, name);
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error(`Invalid deployment mount: ${name}`);
      if (["react", "vanilla-js", "vanilla-ts"].includes(name)) {
        const original = JSON.parse(
          await readFile(join(directory, "webguard-manifest.json"), "utf8"),
        );
        const verified = await verifyManifest(directory, original);
        if (!verified.valid)
          throw new Error(
            `Integrity validation failed for ${name}: ${verified.errors.join("; ")}`,
          );
      }
      const headers = await headersFor(directory);
      manifest.mounts.push({ prefix, headers });
      const target = join(publicRoot, prefix);
      await mkdir(target, { recursive: true });
      async function copy(path = "") {
        for (const entry of await readdir(join(directory, path), {
          withFileTypes: true,
        })) {
          const child = path ? `${path}/${entry.name}` : entry.name;
          const file = join(directory, child);
          const info = await lstat(file);
          if (info.isSymbolicLink())
            throw new Error(
              `Symbolic link cannot be deployed: ${name}/${child}`,
            );
          if (!safeSegments(child)) continue;
          if (info.isDirectory()) {
            await copy(child);
            continue;
          }
          if (!info.isFile())
            throw new Error(`Unsupported deployment file: ${name}/${child}`);
          if (!publicFile(child)) continue;
          const url = prefix + child;
          add(url, url, prefix);
          if (child.endsWith("/index.html"))
            add(prefix + child.slice(0, -"index.html".length), url, prefix);
          await mkdir(dirname(join(target, child)), { recursive: true });
          await writeFile(join(target, child), await readFile(file));
        }
      }
      await copy();
      if (!Object.hasOwn(manifest.assets, prefix + "index.html"))
        throw new Error(`Missing deployment index: ${name}`);
      add(prefix, prefix + "index.html", prefix);
      if (["react", "vanilla-js", "vanilla-ts"].includes(name)) {
        const metadata = await createManifest(target);
        await writeFile(
          join(target, "webguard-manifest.json"),
          JSON.stringify(metadata, null, 2) + "\n",
        );
        add(
          prefix + "webguard-manifest.json",
          prefix + "webguard-manifest.json",
          prefix,
        );
      }
    }
    const distribution = join(input, "distribution");
    let distributionExists = false;
    try {
      await lstat(distribution);
      distributionExists = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (distributionExists) {
      const { assets } = await validateDistribution(distribution);
      for (const asset of assets) {
        const bytes = await readFile(asset.file);
        if (
          bytes.length !== asset.bytes ||
          createHash("sha256").update(bytes).digest("hex") !== asset.sha256
        )
          throw new Error(
            "Distribution asset changed during deployment preparation",
          );
        add(asset.url, asset.url, "/", asset.headers);
        const target = join(publicRoot, asset.url);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
      }
    }
    await writeFile(
      join(stage, "routes.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    let previous = false;
    try {
      await rename(output, backup);
      previous = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(stage, output);
    } catch (error) {
      if (previous) await rename(backup, output);
      throw error;
    }
    if (previous) await rm(backup, { recursive: true, force: true });
    return output;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length > 4)
      throw new Error(
        "Usage: node scripts/prepare-deployment.mjs [input-directory] [output-directory]",
      );
    console.log(
      `Prepared public deployment: ${await prepareDeployment(process.argv[2], process.argv[3])}`,
    );
  } catch (error) {
    console.error(`Deployment preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
