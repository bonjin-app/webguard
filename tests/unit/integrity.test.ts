import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hashContent,
  createManifest,
  verifyManifest,
} from "../../packages/integrity/src/index";
const roots: string[] = [];
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "webguard-"));
  roots.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
describe("integrity", () => {
  it("hashes raw bytes with SHA-384 SRI", () => {
    expect(hashContent("abc")).toBe(
      "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn",
    );
    expect(hashContent(new Uint8Array([97, 98, 99]))).toBe(hashContent("abc"));
  });
  it("creates sorted manifests and excludes its own metadata", async () => {
    const dir = await fixture();
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "z.js"), "z");
    await writeFile(join(dir, "nested/a.js"), "abc");
    await writeFile(join(dir, "webguard-manifest.json"), "ignored");
    await writeFile(join(dir, "webguard-report.json"), "ignored");
    const manifest = await createManifest(dir);
    expect(Object.keys(manifest.files)).toEqual(["nested/a.js", "z.js"]);
    expect(manifest.files["nested/a.js"]?.size).toBe(3);
    expect(await verifyManifest(dir, manifest)).toEqual({
      valid: true,
      errors: [],
    });
    await writeFile(join(dir, "nested/a.js"), "changed");
    await rm(join(dir, "z.js"));
    await writeFile(join(dir, "extra.js"), "x");
    const result = await verifyManifest(dir, manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/nested\/a\.js/);
    expect(result.errors.join(" ")).toMatch(/z\.js/);
    expect(result.errors.join(" ")).toMatch(/extra\.js/);
  });
  it.each([
    "../secret",
    "a/../secret",
    "/absolute",
    "a\\b",
    "a//b",
    "./a",
    "__proto__",
    "constructor",
    "a/",
  ])("rejects unsafe manifest path %s", async (path) => {
    const dir = await fixture();
    const files = Object.create(null);
    files[path] = { integrity: hashContent(""), size: 0 };
    expect(
      (await verifyManifest(dir, { version: 1, algorithm: "sha384", files }))
        .valid,
    ).toBe(false);
  });
  it.each([
    null,
    {},
    { version: 2, algorithm: "sha384", files: {} },
    { version: 1, algorithm: "sha256", files: {} },
    { version: 1, algorithm: "sha384", files: [] },
    {
      version: 1,
      algorithm: "sha384",
      files: { a: { integrity: "sha384-AA==", size: 0 } },
    },
    {
      version: 1,
      algorithm: "sha384",
      files: { a: { integrity: "sha384-" + "A".repeat(64), size: -1 } },
    },
  ])("rejects malformed manifests %#", async (manifest) => {
    expect((await verifyManifest(await fixture(), manifest)).valid).toBe(false);
  });
  it("rejects symlinks without reading their target", async () => {
    const dir = await fixture(),
      outside = await fixture();
    await writeFile(join(outside, "private"), "secret");
    await symlink(join(outside, "private"), join(dir, "link"));
    await expect(createManifest(dir)).rejects.toThrow(/link/);
    expect(
      (
        await verifyManifest(dir, {
          version: 1,
          algorithm: "sha384",
          files: {},
        })
      ).valid,
    ).toBe(false);
  });
});

it("hashes nested metadata names as ordinary payload files", async () => {
  const dir = await fixture();
  await mkdir(join(dir, "nested"));
  await writeFile(join(dir, "nested/webguard-report.json"), "original");
  const manifest = await createManifest(dir);
  expect(manifest.files["nested/webguard-report.json"]?.size).toBe(8);
  await writeFile(join(dir, "nested/webguard-report.json"), "modified");
  expect((await verifyManifest(dir, manifest)).valid).toBe(false);
});

it("excludes root deployment control files from resource verification while hashing nested names", async () => {
  const dir = await fixture();
  await mkdir(join(dir, "nested"));
  await writeFile(join(dir, "_headers"), "/*\n  X-Frame-Options: DENY");
  await writeFile(join(dir, "webguard-headers.json"), "{}");
  await writeFile(join(dir, "app.js"), "globalThis.answer=42");
  await writeFile(join(dir, "nested/_headers"), "payload");
  await writeFile(join(dir, "nested/webguard-headers.json"), "nested");
  const manifest = await createManifest(dir);
  expect(Object.keys(manifest.files)).toEqual([
    "app.js",
    "nested/_headers",
    "nested/webguard-headers.json",
  ]);
  await writeFile(join(dir, "nested/_headers"), "tampered");
  expect((await verifyManifest(dir, manifest)).valid).toBe(false);
});
