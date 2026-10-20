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
import { dirname, join } from "node:path";
import type { Server } from "node:http";
import { build } from "vite";
import { protectDirectory } from "@webguard/cli";
import { verifyManifest } from "@webguard/integrity";
import { webguardApp } from "@webguard/vite-plugin";

const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-private-output-"));
  roots.push(root);
  return root;
}
async function file(root: string, path: string, content = "PRIVATE INPUT") {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
async function paths(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (entry.isDirectory())
        await visit(join(directory, entry.name), path + "/");
      else files.push(path);
    }
  }
  await visit(root);
  return files.sort();
}

const privateFiles = [
  ".metadata",
  ".git/description",
  "src/original.js",
  "server/routes.json",
  "private/internal.json",
  "node_modules/dependency/index.js",
  "tests/fixture.json",
  "__tests__/fixture.json",
  "coverage/data.json",
  "original.ts",
  "view.tsx",
  "view.jsx",
  "component.vue",
  "component.svelte",
  "backend.jsp",
  "backend.java",
  "backend.php",
  "backend.aspx",
  "server.mjs",
  "vite.config.js",
  "runtime.config.json",
  "settings.toml",
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "bun.lockb",
  "nested/_headers",
  "nested/webguard-headers.json",
  "nested/webguard-report.json",
];
const publicFiles: Record<string, string> = {
  "assets/catalog.json": '{"price":9900}',
  "assets/configuration.json": '{"locale":"ko"}',
  "images/private-label.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
  "third-party-licenses.md": "Public distribution license notice",
};

it("removes private publicDir inputs from an actual Vite build while retaining app assets and generated header controls", async () => {
  const root = await fixture();
  await file(
    root,
    "index.html",
    '<script type="module" src="/main.js"></script>',
  );
  await file(root, "main.js", "globalThis.privateOutputDemo = true;");
  for (const path of privateFiles)
    await file(
      join(root, "public"),
      path,
      path.endsWith(".js") || path.endsWith(".mjs")
        ? "export const internal = true;"
        : "PRIVATE INPUT",
    );
  for (const [path, content] of Object.entries(publicFiles))
    await file(join(root, "public"), path, content);
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguardApp({ runtime: false, obfuscation: { enabled: false } })],
  });
  const output = join(root, "dist");
  const published = await paths(output);
  for (const path of privateFiles) expect(published, path).not.toContain(path);
  for (const [path, content] of Object.entries(publicFiles))
    expect(await readFile(join(output, path), "utf8")).toBe(content);
  expect(published).toContain("_headers");
  expect(published).toContain("webguard-headers.json");
  expect(await readFile(join(output, "index.html"), "utf8")).toContain(
    'integrity="sha384-',
  );
  const report = JSON.parse(
    await readFile(join(output, "webguard-report.json"), "utf8"),
  );
  expect(report.removedSources).toEqual(expect.arrayContaining(privateFiles));
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
  expect(
    await readFile(join(root, "public/private/internal.json"), "utf8"),
  ).toBe("PRIVATE INPUT");
});

it("retains deployment controls and archives maps even under a removed private directory", async () => {
  const root = await fixture();
  const input = join(root, "input"),
    output = join(root, "output");
  await file(input, "app.js", "globalThis.ready = true;");
  await file(input, "private/original.js", "globalThis.internal = true;");
  await file(
    input,
    "private/original.js.map",
    '{"version":3,"sourcesContent":["original"]}',
  );
  await file(input, "_headers", "/*\n  X-Content-Type-Options: nosniff\n");
  await file(
    input,
    "webguard-headers.json",
    '{"X-Content-Type-Options":"nosniff"}',
  );
  const report = await protectDirectory(input, {
    output,
    config: {
      obfuscation: { enabled: false },
      sourceMaps: { privateArtifacts: true },
    },
  });
  expect(await paths(output)).not.toContain("private/original.js");
  expect(report.removedSources).toContain("private/original.js");
  expect(report.removedMaps).toEqual(["private/original.js.map"]);
  expect(
    await readFile(
      join(`${output}.private-maps`, "input-maps/private/original.js.map"),
      "utf8",
    ),
  ).toContain('"sourcesContent":["original"]');
  expect(await readFile(join(output, "_headers"), "utf8")).toContain("nosniff");
  expect(
    await readFile(join(output, "webguard-headers.json"), "utf8"),
  ).toContain("nosniff");
});

it.each([
  [".env", "PUBLIC_DEMO=true"],
  ["private/credentials.json", '{"apiKey":"AKIA1234567890ABCDEF"}'],
  ["src/config.js", 'export const key = "AKIA1234567890ABCDEF";'],
])(
  "still rejects credentials in %s before removing private inputs",
  async (path, content) => {
    const root = await fixture(),
      input = join(root, "input");
    await file(input, path, content);
    await expect(
      protectDirectory(input, { output: join(root, "output") }),
    ).rejects.toThrow(/credentials/i);
    expect(await readdir(root)).toEqual(["input"]);
    expect(await readFile(join(input, path), "utf8")).toBe(content);
  },
);

it.each(["webguard-report.json", "webguard-manifest.json"])(
  "keeps the reserved %s input rejection",
  async (path) => {
    const root = await fixture(),
      input = join(root, "input");
    await file(input, path, "{}");
    await expect(
      protectDirectory(input, { output: join(root, "output") }),
    ).rejects.toThrow(/reserved/i);
    expect(await readdir(root)).toEqual(["input"]);
  },
);

it("uses the same exclusions in the static server while keeping the legal notice and application JSON fetchable", async () => {
  const root = await fixture();
  await file(root, "index.html", "<h1>Public app</h1>");
  await file(
    root,
    "webguard-headers.json",
    '{"Content-Security-Policy":"default-src \'none\'"}',
  );
  for (const path of privateFiles) await file(root, path);
  for (const [path, content] of Object.entries(publicFiles))
    await file(root, path, content);
  const { createProtectedServer } =
    await import("../../packages/vite-plugin/src/static-server.mjs");
  const server = await createProtectedServer(root);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  const origin = `http://127.0.0.1:${address.port}`;
  for (const path of privateFiles)
    expect((await fetch(`${origin}/${path}`)).status, path).toBe(404);
  for (const path of Object.keys(publicFiles))
    expect((await fetch(`${origin}/${path}`)).status, path).toBe(200);
});
