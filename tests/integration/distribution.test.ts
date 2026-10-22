import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const faults = vi.hoisted(() => ({ catalogRename: false }));
vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (faults.catalogRename && to.endsWith("/catalog.json"))
        throw new Error("Injected catalog rename failure");
      return actual.rename(from, to);
    },
  };
});

const roots: string[] = [];
const api = async () =>
  import(new URL("../../scripts/distribution.mjs", import.meta.url).href);
const contents = (sdk = "var WebGuardSDK={version:1};") => ({
  version: "0.3.0",
  sdk: Buffer.from(sdk),
  packageArchive: Buffer.from("fixture archive"),
  example: Buffer.from("WebGuardSDK.WebGuard.init({});"),
  licenses: Buffer.from("MIT\n"),
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "webguard-distribution-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  faults.catalogRename = false;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("recovers a first-publication catalog failure without stranding an invalid retention directory", async () => {
  const root = await directory();
  const { publishDistribution, validateDistribution } = await api();
  faults.catalogRename = true;
  await expect(publishDistribution(root, contents())).rejects.toThrow(
    "Injected catalog rename failure",
  );
  faults.catalogRename = false;
  const release = await publishDistribution(root, contents());
  expect((await validateDistribution(root)).catalog.current.id).toBe(
    release.id,
  );
});

it("retains immutable releases, validates exact bytes and derives SRI from delivered SDK", async () => {
  const root = await directory();
  const { publishDistribution, validateDistribution } = await api();
  const first = await publishDistribution(root, contents());
  const second = await publishDistribution(
    root,
    contents("var WebGuardSDK={version:2};"),
  );
  expect(first.id).not.toBe(second.id);
  const { catalog, assets } = await validateDistribution(root);
  expect(catalog.releases.map((entry: { id: string }) => entry.id)).toEqual([
    first.id,
    second.id,
  ]);
  expect(catalog.current.id).toBe(second.id);
  expect(assets).toHaveLength(11);
  const sdk = assets.find(
    (entry: { url: string }) => entry.url === first.sdk.url,
  );
  const bytes = await readFile(sdk.file);
  expect(first.sdk.integrity).toBe(
    "sha384-" + createHash("sha384").update(bytes).digest("base64"),
  );
  expect(sdk.headers["Cross-Origin-Resource-Policy"]).toBe("cross-origin");
  expect(sdk.headers["Access-Control-Allow-Origin"]).toBe("*");
  expect(sdk.headers["Cache-Control"]).toContain("immutable");
  expect(
    assets.find((entry: { url: string }) => entry.url === first.sdk.download)
      .headers["Content-Disposition"],
  ).toContain("attachment");
  expect(assets[0].headers["Cache-Control"]).toBe("no-store");
  await publishDistribution(root, contents());
  expect((await validateDistribution(root)).catalog.releases).toHaveLength(2);
});

it("fails on tampering and preserves the previous catalog instead of publishing a partial release", async () => {
  const root = await directory();
  const { publishDistribution, validateDistribution } = await api();
  const first = await publishDistribution(root, contents());
  const original = await readFile(join(root, "catalog.json"));
  await writeFile(
    join(root, "releases", first.id, "webguard.global.js"),
    "tampered",
  );
  await expect(validateDistribution(root)).rejects.toThrow(
    /integrity|digest|size/i,
  );
  await expect(
    publishDistribution(root, contents("new SDK")),
  ).rejects.toThrow();
  expect(await readFile(join(root, "catalog.json"))).toEqual(original);
});

it("rejects path substitution, extra files and symbolic links", async () => {
  const root = await directory();
  const { publishDistribution, validateDistribution } = await api();
  const first = await publishDistribution(root, contents());
  const catalogPath = join(root, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  catalog.current.sdk.url = "/cdn/releases/../private.js";
  await writeFile(catalogPath, JSON.stringify(catalog));
  await expect(validateDistribution(root)).rejects.toThrow();
  catalog.current = catalog.releases[0];
  await writeFile(catalogPath, JSON.stringify(catalog));
  const extra = join(root, "releases", first.id, "private.map");
  await writeFile(extra, "private");
  await expect(validateDistribution(root)).rejects.toThrow(/unexpected/i);
  await rm(extra);
  await symlink(join(root, "catalog.json"), extra);
  await expect(validateDistribution(root)).rejects.toThrow(
    /unexpected|symbolic/i,
  );
});

it("refuses symlink publication roots and concurrent writers without corrupting retention", async () => {
  const root = await directory();
  const target = await directory();
  const link = join(root, "linked");
  await symlink(target, link);
  const { publishDistribution, validateDistribution } = await api();
  await expect(publishDistribution(link, contents())).rejects.toThrow(
    /real directory/,
  );
  const results = await Promise.allSettled([
    publishDistribution(target, contents()),
    publishDistribution(target, contents("different")),
  ]);
  expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(results.filter((value) => value.status === "rejected")).toHaveLength(
    1,
  );
  expect((await validateDistribution(target)).catalog.releases).toHaveLength(1);
  await publishDistribution(target, contents());
  await publishDistribution(target, contents("different"));
  expect((await validateDistribution(target)).catalog.releases).toHaveLength(2);
});
