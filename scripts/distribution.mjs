import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

const digest = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);
const fail = (message) => {
  throw new Error(`Invalid distribution: ${message}`);
};
const versionPattern = /^\d+\.\d+\.\d+$/;
const names = (version) => [
  "webguard.global.js",
  `uulab-webguard-${version}.tgz`,
  "webguard-init.js",
  "THIRD_PARTY_NOTICES.txt",
];
const releaseId = (version, values) =>
  version + "-" + digest(JSON.stringify(values)).slice(0, 16);
async function realFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    fail(`symbolic link or non-file: ${path}`);
  if (info.size > 20 * 1024 * 1024)
    fail("file size exceeds distribution limit");
  return readFile(path);
}
async function exactDirectory(path, expected) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    fail(`symbolic link or non-directory: ${path}`);
  const actual = (await readdir(path)).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
    fail(`unexpected files in ${path}`);
}
function same(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label);
}
function metadata(bytes) {
  return { sha256: digest(bytes), bytes: bytes.length };
}
function makeRelease(version, bytes) {
  const hashes = bytes.map((value) => digest(value));
  const id = releaseId(version, hashes);
  const download = `/downloads/releases/${id}/`;
  return {
    id,
    version,
    channel: "unpublished-candidate",
    sdk: {
      url: `/cdn/releases/${id}/webguard.global.js`,
      download: download + "webguard.global.js",
      integrity: "sha384-" + digest(bytes[0], "sha384", "base64"),
      ...metadata(bytes[0]),
    },
    package: {
      url: download + `uulab-webguard-${version}.tgz`,
      sha512: digest(bytes[1], "sha512"),
      ...metadata(bytes[1]),
    },
    example: { url: download + "webguard-init.js", ...metadata(bytes[2]) },
    licenses: {
      url: download + "THIRD_PARTY_NOTICES.txt",
      ...metadata(bytes[3]),
    },
  };
}
/** Verify retained bytes before creating an exact public allowlist. No network or npm activity. */
export async function validateDistribution(directory) {
  const root = resolve(directory);
  await exactDirectory(root, ["catalog.json", "releases"]);
  const catalogBytes = await realFile(join(root, "catalog.json"));
  if (catalogBytes.length > 1024 * 1024) fail("catalog too large");
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  if (
    catalog?.version !== 1 ||
    !Array.isArray(catalog.releases) ||
    !catalog.releases.length ||
    catalog.releases.length > 100
  )
    fail("catalog schema");
  const ids = new Set();
  for (const release of catalog.releases) {
    if (
      !versionPattern.test(release?.version) ||
      typeof release?.id !== "string" ||
      !new RegExp(
        `^${release.version.replaceAll(".", "\\.")}-[a-f0-9]{16}$`,
      ).test(release.id) ||
      ids.has(release.id)
    )
      fail("release identity");
    ids.add(release.id);
  }
  await exactDirectory(join(root, "releases"), [...ids]);
  const shared = {
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Access-Control-Allow-Origin": "*",
  };
  const assets = [
    {
      url: "/downloads/catalog.json",
      file: join(root, "catalog.json"),
      ...metadata(catalogBytes),
      headers: {
        ...shared,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  ];
  for (const release of catalog.releases) {
    const files = names(release.version);
    const folder = join(root, "releases", release.id);
    await exactDirectory(folder, files);
    const bytes = await Promise.all(
      files.map((name) => realFile(join(folder, name))),
    );
    same(
      release,
      makeRelease(release.version, bytes),
      "integrity digest, size, or path mismatch",
    );
    const definitions = [
      [release.sdk.url, 0, "text/javascript; charset=utf-8", false],
      [release.sdk.download, 0, "text/javascript; charset=utf-8", true],
      [release.package.url, 1, "application/gzip", true],
      [release.example.url, 2, "text/javascript; charset=utf-8", true],
      [release.licenses.url, 3, "text/plain; charset=utf-8", true],
    ];
    for (const [url, index, type, attachment] of definitions)
      assets.push({
        url,
        file: join(folder, files[index]),
        ...metadata(bytes[index]),
        headers: {
          ...shared,
          "Content-Type": type,
          "Cache-Control": "public, max-age=31536000, immutable",
          ...(attachment
            ? {
                "Content-Disposition": `attachment; filename="${files[index]}"`,
              }
            : {}),
        },
      });
  }
  if (!ids.has(catalog.current?.id)) fail("unknown current release");
  same(
    catalog.current,
    catalog.releases.find((release) => release.id === catalog.current.id),
    "current release mismatch",
  );
  if (Object.keys(catalog).sort().join() !== "current,releases,version")
    fail("unexpected catalog fields");
  return { catalog, assets };
}

/** Add one content-addressed candidate without replacing retained immutable files. */
async function appendDistribution(directory, input) {
  const root = resolve(directory);
  const { version, sdk, packageArchive, example, licenses } = input;
  if (!versionPattern.test(version)) fail("version");
  const bytes = [sdk, packageArchive, example, licenses];
  if (
    bytes.some(
      (value) =>
        !Buffer.isBuffer(value) ||
        value.length === 0 ||
        value.length > 20 * 1024 * 1024,
    )
  )
    fail("empty or oversized release data");
  await mkdir(root, { recursive: true });
  const entries = await readdir(root);
  const previous = entries.length
    ? (await validateDistribution(root)).catalog
    : { version: 1, releases: [] };
  const release = makeRelease(version, bytes);
  const newRelease = !previous.releases.some(
    (value) => value.id === release.id,
  );
  const nextCatalog = {
    version: 1,
    current: release,
    releases: newRelease ? [...previous.releases, release] : previous.releases,
  };
  const catalogText = JSON.stringify(nextCatalog, null, 2) + "\n";
  if (
    nextCatalog.releases.length > 100 ||
    Buffer.byteLength(catalogText) > 1024 * 1024
  )
    fail("retention limit reached; existing releases preserved");
  const target = join(root, "releases", release.id);
  let created = false;
  const temporaryCatalog = join(root, `.catalog-${randomUUID()}`);
  try {
    if (newRelease) {
      await mkdir(join(root, "releases"), { recursive: true });
      const stage = await mkdtemp(join(root, "releases", ".stage-"));
      try {
        await Promise.all(
          names(version).map((name, index) =>
            writeFile(join(stage, name), bytes[index], { flag: "wx" }),
          ),
        );
        await rename(stage, target);
        created = true;
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    }
    await writeFile(temporaryCatalog, catalogText, {
      flag: "wx",
    });
    await rename(temporaryCatalog, join(root, "catalog.json"));
    return release;
  } catch (error) {
    if (created) await rm(target, { recursive: true, force: true });
    if (!entries.length) {
      // Only this transaction could have created the empty parent. Never remove retained releases.
      const parent = join(root, "releases");
      try {
        if ((await readdir(parent)).length === 0)
          await rm(parent, { recursive: true });
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") throw cleanupError;
      }
    }
    throw error;
  } finally {
    await rm(temporaryCatalog, { force: true });
  }
}

export async function publishDistribution(directory, input) {
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink())
    fail("publication root must be a real directory");
  // A sibling lock keeps catalog validation strict and prevents lost updates between builders.
  const lock = root + ".lock";
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === "EEXIST") fail("another distribution writer is active");
    throw error;
  }
  try {
    return await appendDistribution(root, input);
  } finally {
    await rm(lock, { recursive: true });
  }
}
