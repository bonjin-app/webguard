import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { webguard } from "@webguard/vite-plugin";
import { verifyManifest } from "@webguard/integrity";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
it("protects real Vite chunks, preserves lazy import URLs and emits valid final hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "webguard-vite-"));
  roots.push(root);
  await writeFile(
    join(root, "index.html"),
    '<html><body><button id="run">Run</button><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(
    join(root, "main.js"),
    'document.querySelector("button").onclick=async()=>{document.querySelector("button").textContent=(await import("./lazy.js")).answer;}',
  );
  await writeFile(join(root, "lazy.js"), 'export const answer = "Loaded 42";');
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguard({ obfuscation: { stringArrayEncoding: "base64" } })],
    build: { outDir: "dist" },
  });
  const dist = join(root, "dist");
  const html = await readFile(join(dist, "index.html"), "utf8");
  expect(html).toContain('integrity="sha384-');
  const assets = await readdir(join(dist, "assets"));
  expect(assets.some((p) => p.includes("lazy"))).toBe(true);
  expect(assets.some((p) => p.endsWith(".map"))).toBe(false);
  const manifest = JSON.parse(
    await readFile(join(dist, "webguard-manifest.json"), "utf8"),
  );
  expect((await verifyManifest(dist, manifest)).valid).toBe(true);
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguard()],
    build: { outDir: "dist" },
  });
  expect(
    (
      await verifyManifest(
        dist,
        JSON.parse(
          await readFile(join(dist, "webguard-manifest.json"), "utf8"),
        ),
      )
    ).valid,
  ).toBe(true);
});
it("does not protect or replace previous output when a new chunk fails before write", async () => {
  const root = await mkdtemp(join(tmpdir(), "webguard-vite-fail-"));
  roots.push(root);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist", "old.js"), "globalThis.previous = true;");
  await writeFile(
    join(root, "index.html"),
    '<script type="module" src="/main.js"></script>',
  );
  await writeFile(join(root, "main.js"), "globalThis.current = true;");
  await expect(
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [
        {
          name: "deliberate-render-failure",
          renderChunk() {
            throw new Error("Expected rendering failure");
          },
        },
        webguard(),
      ],
      build: { outDir: "dist", emptyOutDir: false },
    }),
  ).rejects.toThrow("Expected rendering failure");
  expect(await readdir(join(root, "dist"))).toEqual(["old.js"]);
  expect(await readFile(join(root, "dist", "old.js"), "utf8")).toBe(
    "globalThis.previous = true;",
  );
});
it("adds working SRI when built under a non-root Vite public base", async () => {
  const root = await mkdtemp(join(tmpdir(), "webguard-vite-base-"));
  roots.push(root);
  await writeFile(
    join(root, "index.html"),
    '<script type="module" src="/main.js"></script>',
  );
  await writeFile(join(root, "main.js"), 'document.body.textContent="ready";');
  await build({
    root,
    base: "/prefix/",
    configFile: false,
    logLevel: "silent",
    plugins: [webguard()],
    build: { outDir: "dist" },
  });
  const html = await readFile(join(root, "dist", "index.html"), "utf8");
  expect(html).toContain("/prefix/assets/");
  expect(html).toContain('integrity="sha384-');
});
it("checks credentials before optional encoding can conceal credential patterns", async () => {
  const root = await mkdtemp(join(tmpdir(), "webguard-vite-secret-"));
  roots.push(root);
  await writeFile(
    join(root, "index.html"),
    '<script type="module" src="/main.js"></script>',
  );
  await writeFile(
    join(root, "main.js"),
    'globalThis.key="AKIA1234567890ABCDEF";',
  );
  await expect(
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [webguard({ obfuscation: { stringArrayEncoding: "base64" } })],
      build: { outDir: "dist" },
    }),
  ).rejects.toThrow(/credentials/i);
});
