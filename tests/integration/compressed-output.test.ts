import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { protectAppDirectory, protectDirectory } from "@webguard/cli";
import { createManifest } from "@webguard/integrity";
import { checkDeployment } from "../../packages/cli/src/check";
import { createProtectedServer } from "../../packages/vite-plugin/src/static-server.mjs";

const roots: string[] = [],
  servers: Server[] = [];
const headers = {
  "Content-Security-Policy": "default-src 'self'",
  "X-Content-Type-Options": "nosniff",
};
const map = JSON.stringify({
  version: 3,
  sources: ["original.ts"],
  sourcesContent: ["const originalSourceMarker = 42"],
  mappings: "",
});
const compressedPrivate = new Map<string, Uint8Array>([
  ["app.js.map.gz", gzipSync(map)],
  ["app.css.map.br", brotliCompressSync(Buffer.from(map))],
  ["app.js.map.gz.br", brotliCompressSync(gzipSync(map))],
  ["original.ts.gz", gzipSync("const originalSourceMarker = 42")],
  ["private.env.gz", gzipSync("SYNTHETIC_REVIEW_FIXTURE=true")],
  ["webguard-report.json.gz", gzipSync("{}")],
  ["webguard-headers.json.br", brotliCompressSync(Buffer.from("{}"))],
  ["_headers.gz", gzipSync("local deployment control")],
  ["package.json.br.gz", gzipSync(brotliCompressSync(Buffer.from("{}")))],
  ["runtime.config.json.gz", gzipSync("{}")],
]);
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-compressed-"));
  roots.push(root);
  const input = join(root, "input"),
    output = join(root, "output");
  await mkdir(input);
  await writeFile(join(input, "index.html"), '<script src="app.js"></script>');
  await writeFile(
    join(input, "app.js"),
    'globalThis.reviewResult="protected application";',
  );
  await writeFile(
    join(input, "webguard-headers.json"),
    JSON.stringify(headers),
  );
  return { root, input, output };
}
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing HTTP port");
  return `http://127.0.0.1:${address.port}/`;
}

it.each([
  ["app.js.gz", gzipSync("globalThis.unprotectedOriginal=true")],
  ["app.mjs.br", brotliCompressSync(Buffer.from("export const original=true"))],
  [
    "app.cjs.gz.br",
    brotliCompressSync(gzipSync("module.exports={original:true}")),
  ],
  [
    "app.css.br.gz",
    gzipSync(brotliCompressSync(Buffer.from(".original{color:red}"))),
  ],
  ["APP.JS.GZ", gzipSync("globalThis.unprotectedOriginal=true")],
  ["invalid.js.br", Buffer.from("not a compressed stream")],
] as const)(
  "refuses precompressed code %s before staging even when transformation is disabled",
  async (path, bytes) => {
    const { root, input, output } = await fixture();
    await writeFile(join(input, path), bytes);
    await expect(
      protectDirectory(input, {
        output,
        config: {
          obfuscation: { enabled: false },
          sourceMaps: { privateArtifacts: true },
        },
      }),
    ).rejects.toThrow(/precompressed.*(?:JavaScript|CSS)/i);
    expect(await readdir(root)).toEqual(["input"]);
    expect(await readFile(join(input, path))).toEqual(bytes);
  },
);

it("refuses stale compressed scripts through the application wrapper without publishing output", async () => {
  const { root, input, output } = await fixture();
  await writeFile(
    join(input, "app.js.gz"),
    gzipSync("globalThis.original=true"),
  );
  await expect(
    protectAppDirectory(input, { output, runtime: false, headers: false }),
  ).rejects.toThrow(/precompressed/i);
  expect(await readdir(root)).toEqual(["input"]);
});

it("removes compressed private inputs and archives map bytes without touching a public compressed resource", async () => {
  const { input, output } = await fixture();
  for (const [path, bytes] of compressedPrivate)
    await writeFile(join(input, path), bytes);
  const download = gzipSync('{"publicCatalog":[1,2,3]}');
  await writeFile(join(input, "catalog.json.gz"), download);
  const report = await protectDirectory(input, {
    output,
    config: { sourceMaps: { privateArtifacts: true } },
  });
  const published = await readdir(output);
  for (const [path, bytes] of compressedPrivate) {
    expect(published, path).not.toContain(path);
    expect(await readFile(join(input, path))).toEqual(bytes);
  }
  expect(report.removedMaps).toEqual([
    "app.css.map.br",
    "app.js.map.gz",
    "app.js.map.gz.br",
  ]);
  for (const path of report.removedMaps)
    expect(
      await readFile(join(`${output}.private-maps`, "input-maps", path)),
    ).toEqual(compressedPrivate.get(path));
  expect(report.removedSources).toEqual(
    expect.arrayContaining([
      "private.env.gz",
      "original.ts.gz",
      "webguard-report.json.gz",
      "package.json.br.gz",
    ]),
  );
  expect(await readFile(join(output, "catalog.json.gz"))).toEqual(download);
});

it("denies compressed source, map, control and code variants in the protected HTTP server", async () => {
  const { input } = await fixture();
  for (const [path, bytes] of compressedPrivate)
    await writeFile(join(input, path), bytes);
  await writeFile(
    join(input, "app.js.gz"),
    gzipSync("globalThis.original=true"),
  );
  const download = gzipSync("public download");
  await writeFile(join(input, "catalog.json.gz"), download);
  const origin = await listen(await createProtectedServer(input));
  for (const path of [...compressedPrivate.keys(), "app.js.gz"]) {
    const response = await fetch(new URL(path, origin));
    expect(response.status, path).toBe(404);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  }
  const response = await fetch(new URL("catalog.json.gz", origin));
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(download);
});

async function deployment(
  output: string,
  exposed?: string,
  transferEncoding?: "gzip" | "br",
) {
  const requests: string[] = [];
  const origin = await listen(
    createServer(async (request, response) => {
      const path = request.url?.slice(1) || "index.html";
      requests.push(path);
      for (const [name, value] of Object.entries(headers))
        response.setHeader(name, value);
      if (path === exposed) {
        response.end(gzipSync(map));
        return;
      }
      if (["index.html", "app.js", "webguard-manifest.json"].includes(path)) {
        const bytes = await readFile(join(output, path));
        if (transferEncoding) {
          response.setHeader("Content-Encoding", transferEncoding);
          response.end(
            transferEncoding === "gzip"
              ? gzipSync(bytes)
              : brotliCompressSync(bytes),
          );
        } else response.end(bytes);
        return;
      }
      response.statusCode = 404;
      response.end();
    }),
  );
  return { origin, requests };
}

it.each([
  "app.js.map.gz",
  "app.js.map.br",
  "app.js.map.gz.br",
  "webguard-report.json.gz",
  "webguard-report.json.br.gz",
])(
  "fails deployment verification when an unrecorded compressed private URL is exposed: %s",
  async (path) => {
    const { input, output } = await fixture();
    await protectDirectory(input, { output });
    const { origin, requests } = await deployment(output, path);
    const result = await checkDeployment(output, origin);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain(path);
    expect(requests).toContain(path);
  },
);

it("probes recorded compound compression and original-source paths removed during protection", async () => {
  const { input, output } = await fixture();
  for (const path of ["app.js.map.gz.br", "original.ts.gz"])
    await writeFile(join(input, path), compressedPrivate.get(path)!);
  await protectDirectory(input, { output });
  for (const path of ["app.js.map.gz.br", "original.ts.gz"]) {
    const { origin, requests } = await deployment(output, path);
    const result = await checkDeployment(output, origin);
    expect(result.valid, path).toBe(false);
    expect(result.errors.join(" ")).toContain(path);
    expect(requests).toContain(path);
  }
});

it("refuses a local manifest that lists a compressed private asset before networking", async () => {
  const { input } = await fixture();
  await writeFile(join(input, "app.js.map.gz"), gzipSync(map));
  await writeFile(
    join(input, "webguard-manifest.json"),
    JSON.stringify(await createManifest(input)),
  );
  const { origin, requests } = await deployment(input, "app.js.map.gz");
  const result = await checkDeployment(input, origin);
  expect(result).toMatchObject({
    valid: false,
    checked: 0,
  });
  expect(result.errors.join(" ")).toMatch(/non-public.*app\.js\.map\.gz/i);
  expect(requests).toEqual([]);
});

it.each([undefined, "gzip", "br"] as const)(
  "accepts final application bytes with compressed private paths absent (HTTP encoding=%s)",
  async (transferEncoding) => {
    const { input, output } = await fixture();
    await protectDirectory(input, { output });
    const { origin } = await deployment(output, undefined, transferEncoding);
    expect(await checkDeployment(output, origin)).toMatchObject({
      valid: true,
      errors: [],
    });
  },
);
