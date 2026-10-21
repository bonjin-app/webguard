import { expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { verifyManifest } from "@webguard/integrity";

it("obfuscates the actual documentation app and hashes its final delivered chunks", async () => {
  const output = await mkdtemp(join(tmpdir(), "webguard-demo-docs-"));
  try {
    await build({
      root: resolve("apps/docs"),
      base: "/docs/",
      logLevel: "silent",
      build: { outDir: output, emptyOutDir: true },
    });
    const report = JSON.parse(
      await readFile(join(output, "webguard-report.json"), "utf8"),
    );
    expect(report.integration).toBe("vite");
    expect(Object.keys(report.chunkTransforms)).not.toHaveLength(0);
    const manifest = JSON.parse(
      await readFile(join(output, "webguard-manifest.json"), "utf8"),
    );
    expect((await verifyManifest(output, manifest)).valid).toBe(true);
    expect(await readFile(join(output, "index.html"), "utf8")).toContain(
      'integrity="sha384-',
    );
    expect(
      (await readdir(join(output, "assets"))).some((p) => p.endsWith(".map")),
    ).toBe(false);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
