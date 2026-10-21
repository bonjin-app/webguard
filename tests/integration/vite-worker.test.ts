import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { build } from "vite";
import { webguard } from "@webguard/vite-plugin";
import { verifyManifest } from "@webguard/integrity";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(workerSource?: string) {
  const root = await mkdtemp(join(tmpdir(), "webguard-vite-worker-"));
  roots.push(root);
  await Promise.all([
    writeFile(join(root, "package.json"), '{"type":"module"}'),
    writeFile(
      join(root, "index.html"),
      '<script type="module" src="/main.js"></script>',
    ),
    writeFile(
      join(root, "main.js"),
      'globalThis.applicationWorker = new Worker(new URL("./calculate.worker.js", import.meta.url), { type: "module" });',
    ),
    writeFile(
      join(root, "calculate.worker.js"),
      workerSource ??
        'self.onmessage = async ({ data }) => { const { calculate } = await import("./helper.js"); self.postMessage({ label: "Worker internal calculation phrase", total: calculate(data) }); };',
    ),
    writeFile(
      join(root, "helper.js"),
      'export const calculate = (value) => ({ answer: value * 2, label: "Helper internal calculation phrase" });',
    ),
  ]);
  return root;
}

async function runWorker(file: string): Promise<unknown> {
  // Run the emitted ESM worker and its real dynamic import in an isolated thread.
  // The bridge only supplies the Web Worker message surface missing in Node.
  const worker = new Worker(
    `const { parentPort, workerData } = require("node:worker_threads");
     globalThis.self = { postMessage: (message) => parentPort.postMessage(message) };
     import(workerData).then(() => self.onmessage({ data: 21 }));`,
    { eval: true, workerData: pathToFileURL(file).href },
  );
  try {
    return await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (code) =>
        reject(new Error(`Worker exited before replying: ${code}`)),
      );
    });
  } finally {
    await worker.terminate();
  }
}

it.each([false, true])(
  "protects an ESM worker and lazy helper without writing a second output directory (explicit worker dir: %s)",
  async (explicitWorkerDir) => {
    const root = await fixture();
    await build({
      root,
      configFile: false,
      publicDir: false,
      logLevel: "silent",
      plugins: [webguard({ preset: "strict" })],
      worker: {
        format: "es",
        plugins: () => [webguard({ preset: "strict" })],
        ...(explicitWorkerDir
          ? {
              rolldownOptions: {
                output: { dir: join(root, "worker-generated-only") },
              },
            }
          : {}),
      },
      build: { outDir: "dist" },
    });
    const dist = join(root, "dist");
    const assets = await readdir(join(dist, "assets"));
    const workerFile = assets.find((file) =>
      /^calculate\.worker-.*\.js$/.test(file),
    );
    const helperFile = assets.find((file) => /^helper-.*\.js$/.test(file));
    expect(workerFile).toBeDefined();
    expect(helperFile).toBeDefined();
    for (const file of [workerFile!, helperFile!]) {
      const code = await readFile(join(dist, "assets", file), "utf8");
      expect(code).not.toContain("internal calculation phrase");
      expect(code).not.toContain("sourceMappingURL");
    }
    expect(assets.some((file) => file.endsWith(".map"))).toBe(false);
    expect(await runWorker(join(dist, "assets", workerFile!))).toEqual({
      label: "Worker internal calculation phrase",
      total: { answer: 42, label: "Helper internal calculation phrase" },
    });
    const manifest = JSON.parse(
      await readFile(join(dist, "webguard-manifest.json"), "utf8"),
    );
    expect((await verifyManifest(dist, manifest)).valid).toBe(true);
    expect((await readdir(root)).sort()).toEqual([
      "calculate.worker.js",
      "dist",
      "helper.js",
      "index.html",
      "main.js",
      "package.json",
    ]);
  },
);

it("checks worker credentials before obfuscation, including an obfuscation opt-out", async () => {
  const root = await fixture(
    'self.onmessage = () => self.postMessage("AKIA1234567890ABCDEF");',
  );
  await expect(
    build({
      root,
      configFile: false,
      publicDir: false,
      logLevel: "silent",
      plugins: [webguard({ preset: "strict" })],
      worker: {
        format: "es",
        plugins: () => [webguard({ obfuscation: { enabled: false } })],
      },
    }),
  ).rejects.toThrow(/credentials detected before protection/i);
  expect((await readdir(root)).includes("dist")).toBe(false);
});
