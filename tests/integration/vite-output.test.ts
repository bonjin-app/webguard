import { afterEach, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { webguard } from "@webguard/vite-plugin";
import { verifyManifest } from "@webguard/integrity";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-vite-output-"));
  roots.push(root);
  await writeFile(
    join(root, "index.html"),
    '<script type="module" src="/main.js"></script>',
  );
  await writeFile(join(root, "main.js"), 'document.body.textContent="ready";');
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist", "previous.txt"), "PREVIOUS BUILD");
  return root;
}

it.each(["rollupOptions", "rolldownOptions"] as const)(
  "rejects a different %s output directory before touching either output",
  async (optionsKey) => {
    const root = await fixture();
    let transformed = false;
    await expect(
      build({
        root,
        configFile: false,
        publicDir: false,
        logLevel: "silent",
        plugins: [
          {
            name: "observe-output-validation-timing",
            transform() {
              transformed = true;
            },
          },
          webguard({
            obfuscation: { enabled: false },
            sourceMaps: { privateArtifacts: true },
          }),
        ],
        build: {
          outDir: "dist",
          emptyOutDir: false,
          [optionsKey]: { output: { dir: join(root, "unprotected") } },
        },
      }),
    ).rejects.toThrow(/WebGuard.*(?:output|outDir)/i);
    expect(transformed).toBe(false);
    expect((await readdir(root)).sort()).toEqual([
      "dist",
      "index.html",
      "main.js",
    ]);
    expect(await readFile(join(root, "dist", "previous.txt"), "utf8")).toBe(
      "PREVIOUS BUILD",
    );
  },
);

it("rejects a relative output directory whose bundler working directory differs from Vite root", async () => {
  const root = await fixture();
  const workingDirectory = join(root, "bundler");
  await mkdir(workingDirectory);
  await expect(
    build({
      root,
      configFile: false,
      publicDir: false,
      logLevel: "silent",
      plugins: [webguard({ obfuscation: { enabled: false } })],
      build: {
        outDir: "dist",
        emptyOutDir: false,
        rolldownOptions: { cwd: workingDirectory, output: { dir: "dist" } },
      },
    }),
  ).rejects.toThrow(/WebGuard.*(?:output|outDir)/i);
  expect(await readdir(workingDirectory)).toEqual([]);
  expect(await readFile(join(root, "dist", "previous.txt"), "utf8")).toBe(
    "PREVIOUS BUILD",
  );
});

it("rejects an outputOptions hook redirect before writing unprotected files", async () => {
  const root = await fixture();
  await expect(
    build({
      root,
      configFile: false,
      publicDir: false,
      logLevel: "silent",
      plugins: [
        webguard({
          obfuscation: { enabled: false },
          sourceMaps: { privateArtifacts: true },
        }),
        {
          name: "redirect-bundler-output",
          outputOptions(output) {
            return { ...output, dir: join(root, "unprotected") };
          },
        },
      ],
      build: { outDir: "dist", emptyOutDir: false },
    }),
  ).rejects.toThrow(/WebGuard.*(?:output|outDir)/i);
  expect((await readdir(root)).sort()).toEqual([
    "dist",
    "index.html",
    "main.js",
  ]);
  expect(await readFile(join(root, "dist", "previous.txt"), "utf8")).toBe(
    "PREVIOUS BUILD",
  );
});

it("allows a relative output directory when both Vite and its bundler resolve it to build.outDir", async () => {
  const root = await fixture();
  await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    plugins: [webguard({ obfuscation: { enabled: false } })],
    build: {
      outDir: "dist",
      rolldownOptions: { cwd: root, output: { dir: "dist" } },
    },
  });
  const output = join(root, "dist");
  expect(await readFile(join(output, "index.html"), "utf8")).toContain(
    'integrity="sha384-',
  );
  expect(
    (
      await verifyManifest(
        output,
        JSON.parse(
          await readFile(join(output, "webguard-manifest.json"), "utf8"),
        ),
      )
    ).valid,
  ).toBe(true);
});

it.each(["rollupOptions", "rolldownOptions"] as const)(
  "rejects %s output arrays before building even when they name the configured directory",
  async (optionsKey) => {
    const root = await fixture();
    for (const output of [
      [{ dir: join(root, "dist") }],
      [{ dir: join(root, "dist") }, { dir: join(root, "other") }],
    ]) {
      await expect(
        build({
          root,
          configFile: false,
          publicDir: false,
          logLevel: "silent",
          plugins: [webguard({ obfuscation: { enabled: false } })],
          build: { outDir: "dist", [optionsKey]: { output } },
        }),
      ).rejects.toThrow(/WebGuard.*single.*output/i);
      expect(await readFile(join(root, "dist", "previous.txt"), "utf8")).toBe(
        "PREVIOUS BUILD",
      );
      expect((await readdir(root)).sort()).toEqual([
        "dist",
        "index.html",
        "main.js",
      ]);
    }
  },
);

it.each(["rollupOptions", "rolldownOptions"] as const)(
  "rejects %s output.file with a WebGuard configuration error",
  async (optionsKey) => {
    const root = await fixture();
    await expect(
      build({
        root,
        configFile: false,
        publicDir: false,
        logLevel: "silent",
        plugins: [webguard()],
        build: {
          outDir: "dist",
          [optionsKey]: { output: { file: join(root, "other.js") } },
        },
      }),
    ).rejects.toThrow(/WebGuard.*output\.file/i);
    expect(await readFile(join(root, "dist", "previous.txt"), "utf8")).toBe(
      "PREVIOUS BUILD",
    );
  },
);

it.each(["rollupOptions", "rolldownOptions"] as const)(
  "keeps a matching %s output directory protected",
  async (optionsKey) => {
    const root = await fixture();
    await build({
      root,
      configFile: false,
      publicDir: false,
      logLevel: "silent",
      plugins: [
        webguard({
          obfuscation: { enabled: false },
          sourceMaps: { privateArtifacts: true },
        }),
      ],
      build: {
        outDir: "dist",
        [optionsKey]: { output: { dir: join(root, "dist") } },
      },
    });
    const output = join(root, "dist");
    expect(await readFile(join(output, "index.html"), "utf8")).toContain(
      'integrity="sha384-',
    );
    expect(
      (await readdir(join(output, "assets"))).some((p) => p.endsWith(".map")),
    ).toBe(false);
    const manifest = JSON.parse(
      await readFile(join(output, "webguard-manifest.json"), "utf8"),
    );
    expect((await verifyManifest(output, manifest)).valid).toBe(true);
  },
);

it("accepts a matching absolute output directory before its parent exists", async () => {
  const root = await fixture();
  const output = join(root, "nested", "dist");
  await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    plugins: [webguard({ obfuscation: { enabled: false } })],
    build: {
      outDir: "nested/dist",
      rolldownOptions: { output: { dir: output } },
    },
  });
  expect(await readFile(join(output, "index.html"), "utf8")).toContain(
    'integrity="sha384-',
  );
});
