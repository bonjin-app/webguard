import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createManifest } from "@webguard/integrity";
import { checkDeployment } from "../../packages/cli/src/check";
const execute = promisify(execFile);
const roots: string[] = [],
  servers: Server[] = [];
const headers = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
};
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-check-"));
  roots.push(root);
  await writeFile(join(root, "index.html"), '<script src="app.js"></script>');
  await writeFile(join(root, "app.js"), "globalThis.answer=42;");
  await writeFile(join(root, "webguard-headers.json"), JSON.stringify(headers));
  await writeFile(
    join(root, "webguard-manifest.json"),
    JSON.stringify(await createManifest(root)),
  );
  return root;
}
async function host(
  root: string,
  options: {
    omitHeaders?: boolean;
    expose?: string[];
    tamperEntry?: boolean;
  } = {},
) {
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    const path = (req.url ?? "").replace(/^\/app\//, "");
    requests.push(path);
    if (!options.omitHeaders)
      for (const [key, value] of Object.entries(headers))
        res.setHeader(key, value);
    if (path === "" && options.tamperEntry) {
      res.end(
        Buffer.alloc((await readFile(join(root, "index.html"))).length, 120),
      );
      return;
    }
    if (
      path === "" ||
      path === "index.html" ||
      path === "app.js" ||
      options.expose?.includes(path)
    ) {
      try {
        res.end(await readFile(join(root, path || "index.html")));
        return;
      } catch {
        /* Missing exposed fixture. */
      }
    }
    res.statusCode = 404;
    res.end();
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server address");
  return { url: `http://127.0.0.1:${address.port}/app/`, requests };
}
it("verifies trusted local output and required remote headers without requiring a report", async () => {
  const root = await fixture();
  const server = await host(root);
  const result = await checkDeployment(root, server.url);
  expect(result.valid).toBe(true);
  expect(result.errors).toEqual([]);
  expect(result.checked).toBeGreaterThan(0);
  expect(server.requests).toEqual(
    expect.arrayContaining([
      "webguard-report.json",
      "webguard-headers.json",
      "_headers",
    ]),
  );
});
it("reports missing remote security headers", async () => {
  const root = await fixture();
  const server = await host(root, { omitHeaders: true });
  const result = await checkDeployment(root, server.url);
  expect(result.valid).toBe(false);
  expect(result.errors.join(" ")).toMatch(/header/i);
});
it("detects changed entry HTML even when the /index.html asset and all headers match", async () => {
  const root = await fixture();
  const server = await host(root, { tamperEntry: true });
  const result = await checkDeployment(root, server.url);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Deployed hash mismatch: /");
});
it("rejects changed local files without any HTTP request", async () => {
  const root = await fixture();
  await writeFile(join(root, "app.js"), "tampered");
  const server = await host(root);
  const result = await checkDeployment(root, server.url);
  expect(result).toMatchObject({ valid: false, checked: 0 });
  expect(result.errors.join(" ")).toMatch(/app\.js/);
  expect(server.requests).toEqual([]);
});
it.each([
  null,
  [],
  { "Content-Security-Policy": " " },
  {
    "Content-Security-Policy": headers["Content-Security-Policy"],
    "X-Content-Type-Options": "wrong",
  },
  { ...headers, bad: 42 },
  { ...headers, "x-content-type-options": "nosniff" },
  { ...headers, bad: "value\r\nInjected: true" },
])(
  "rejects malformed local header policy before networking %#",
  async (policy) => {
    const root = await fixture();
    await writeFile(
      join(root, "webguard-headers.json"),
      JSON.stringify(policy),
    );
    const server = await host(root);
    expect(await checkDeployment(root, server.url)).toMatchObject({
      valid: false,
      checked: 0,
    });
    expect(server.requests).toEqual([]);
  },
);
it("requires the local header policy file", async () => {
  const root = await fixture();
  await rm(join(root, "webguard-headers.json"));
  const server = await host(root);
  expect(await checkDeployment(root, server.url)).toMatchObject({
    valid: false,
    checked: 0,
  });
  expect(server.requests).toEqual([]);
});
it.each([
  { removedSources: "source.ts", removedMaps: [] },
  { removedSources: [], removedMaps: [42] },
  { removedSources: ["../private"], removedMaps: [] },
  {},
])(
  "rejects malformed optional reports before networking %#",
  async (report) => {
    const root = await fixture();
    await writeFile(join(root, "webguard-report.json"), JSON.stringify(report));
    const server = await host(root);
    expect(await checkDeployment(root, server.url)).toMatchObject({
      valid: false,
      checked: 0,
    });
    expect(server.requests).toEqual([]);
  },
);
it("detects exposed reports and probes every recorded removed source/map", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "webguard-report.json"),
    JSON.stringify({
      removedSources: ["source.ts"],
      removedMaps: ["old.js.map"],
    }),
  );
  const server = await host(root, { expose: ["webguard-report.json"] });
  const result = await checkDeployment(root, server.url);
  expect(result.valid).toBe(false);
  expect(result.errors.join(" ")).toContain("webguard-report.json");
  expect(server.requests).toEqual(
    expect.arrayContaining(["source.ts", "old.js.map"]),
  );
});
it.each([
  "file:///tmp/dist",
  "https://user:password@example.com/",
  "not a URL",
])("rejects invalid deployment URL before networking %s", async (url) => {
  const root = await fixture();
  expect(await checkDeployment(root, url)).toMatchObject({
    valid: false,
    checked: 0,
  });
});
it("ships the package API and executable with JSON success/failure and useful usage", async () => {
  const root = await fixture();
  const server = await host(root);
  const bin = resolve("packages/npm/dist/check.js");
  const result = await execute(process.execPath, [
    bin,
    root,
    "--url",
    server.url,
  ]);
  expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, errors: [] });
  const api = await execute(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "const {checkDeployment}=await import('uulab-webguard/verify'); console.log(JSON.stringify(await checkDeployment(process.argv[1],process.argv[2])))",
      root,
      server.url,
    ],
    { cwd: resolve("packages/npm") },
  );
  expect(JSON.parse(api.stdout)).toMatchObject({ valid: true, errors: [] });
  server.requests.length = 0;
  await writeFile(join(root, "app.js"), "tampered");
  let failed: { code?: number; stdout?: string } | undefined;
  try {
    await execute(process.execPath, [bin, root, "--url", server.url]);
  } catch (error) {
    failed = error as typeof failed;
  }
  expect(failed?.code).toBe(1);
  expect(JSON.parse(failed?.stdout ?? "{}")).toMatchObject({
    valid: false,
    checked: 0,
  });
  expect(server.requests).toEqual([]);
  let invalid: { code?: number; stdout?: string } | undefined;
  try {
    await execute(process.execPath, [bin, root]);
  } catch (error) {
    invalid = error as typeof invalid;
  }
  expect(invalid?.code).toBe(1);
  expect(JSON.parse(invalid?.stdout ?? "{}")).toMatchObject({
    valid: false,
    checked: 0,
  });
  const help = await execute(process.execPath, [bin, "--help"]);
  expect(help.stdout).toContain("webguard-check <directory> --url <base-url>");
  const pkg = JSON.parse(await readFile("packages/npm/package.json", "utf8"));
  expect(pkg.bin["webguard-check"]).toBe("./dist/check.js");
  expect(pkg.exports["./verify"].import).toBe("./dist/verify.js");
});

it.skipIf(process.platform === "win32")(
  "rejects a real FIFO manifest without blocking the CLI or making HTTP requests",
  async () => {
    const root = await fixture();
    const server = await host(root);
    const manifest = join(root, "webguard-manifest.json");
    await rm(manifest);
    await execute("mkfifo", [manifest]);
    let failure:
      { code?: number | string; killed?: boolean; stdout?: string } | undefined;
    try {
      await execute(
        process.execPath,
        [resolve("packages/npm/dist/check.js"), root, "--url", server.url],
        { timeout: 2000, killSignal: "SIGKILL" },
      );
    } catch (error) {
      failure = error as typeof failure;
    }
    expect(
      failure?.killed,
      "CLI must reject FIFO input before its timeout",
    ).toBe(false);
    expect(failure?.code).toBe(1);
    expect(JSON.parse(failure?.stdout ?? "{}")).toMatchObject({
      valid: false,
      checked: 0,
    });
    expect(server.requests).toEqual([]);
  },
);
