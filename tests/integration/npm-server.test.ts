import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const roots: string[] = [],
  servers: Server[] = [],
  children: ChildProcess[] = [];
const headers = {
  "Content-Security-Policy": "default-src 'self'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
};
afterEach(async () => {
  await Promise.all(
    children.splice(0).map(
      (child) =>
        new Promise<void>((resolveClose) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolveClose();
            return;
          }
          child.once("close", () => resolveClose());
          child.kill("SIGTERM");
        }),
    ),
  );
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolveClose) => {
          if (!server.listening) {
            resolveClose();
            return;
          }
          server.closeAllConnections();
          server.close(() => resolveClose());
        }),
    ),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-npm-server-"));
  roots.push(root);
  await mkdir(join(root, "assets"));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "private"));
  await mkdir(join(root, "server"));
  await writeFile(
    join(root, "index.html"),
    "<!doctype html><title>Public server consumer</title>",
  );
  await writeFile(join(root, "assets/app.js"), "globalThis.answer=42;");
  await writeFile(join(root, "webguard-headers.json"), JSON.stringify(headers));
  for (const path of [
    "webguard-report.json",
    "package.json",
    ".env",
    "vite.config.ts",
    "assets/app.js.map",
    "src/main.ts",
    "private/secret.js",
    "server/secret.js",
    "server.js",
    "server.mjs",
    "server.cjs",
  ])
    await writeFile(join(root, path), "PRIVATE_FIXTURE_CONTENT");
  return root;
}
async function listen(server: Server) {
  await new Promise<void>((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  return address.port;
}
async function verifyHttp(url: string) {
  const page = await fetch(url);
  expect(page.status).toBe(200);
  expect(page.headers.get("content-security-policy")).toBe(
    headers["Content-Security-Policy"],
  );
  expect(page.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await page.text()).toContain("Public server consumer");
  expect(await (await fetch(url + "/assets/app.js")).text()).toBe(
    "globalThis.answer=42;",
  );
  for (const path of [
    "webguard-headers.json",
    "webguard-report.json",
    "package.json",
    ".env",
    "vite.config.ts",
    "assets/app.js.map",
    "src/main.ts",
    "private/secret.js",
    "server/secret.js",
    "server.js",
    "server.mjs",
    "server.cjs",
  ]) {
    const response = await fetch(url + "/" + path);
    expect(response.status, path).toBe(404);
    expect(await response.text()).not.toContain("PRIVATE_FIXTURE_CONTENT");
  }
}
it("exports the bundled protected-server API without starting a listener on import", async () => {
  const module = (await import(
    new URL("../../packages/npm/dist/server.js", import.meta.url).href
  )) as { createProtectedServer(directory: string): Promise<Server> };
  const server = await module.createProtectedServer(await fixture());
  servers.push(server);
  expect(server.listening).toBe(false);
  await verifyHttp(`http://127.0.0.1:${await listen(server)}`);
  const metadata = JSON.parse(
    await readFile("packages/npm/package.json", "utf8"),
  );
  expect(metadata.exports["./server"]).toEqual({
    types: "./dist/server.d.ts",
    import: "./dist/server.js",
  });
});
it("runs the built server CLI and rejects invalid arguments with actionable usage", async () => {
  const root = await fixture();
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>((r) => reservation.close(() => r()));
  const bin = resolve("packages/npm/dist/serve.js");
  const child = spawn(process.execPath, [bin, root, "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let stderr = "";
  child.stderr?.on("data", (bytes) => {
    stderr += String(bytes);
  });
  const url = `http://127.0.0.1:${port}`;
  await expect
    .poll(
      async () => {
        if (child.exitCode !== null)
          throw new Error(`CLI exited early: ${stderr}`);
        try {
          return (await fetch(url, { signal: AbortSignal.timeout(500) }))
            .status;
        } catch {
          return 0;
        }
      },
      { timeout: 10000 },
    )
    .toBe(200);
  await verifyHttp(url);
  let failure: { code?: number; stderr?: string; stdout?: string } | undefined;
  try {
    await run(process.execPath, [bin], { timeout: 5000 });
  } catch (error) {
    failure = error as typeof failure;
  }
  expect(failure?.code).toBe(1);
  expect((failure?.stderr ?? "") + (failure?.stdout ?? "")).toContain(
    "webguard-serve",
  );
  const metadata = JSON.parse(
    await readFile("packages/npm/package.json", "utf8"),
  );
  expect(metadata.bin["webguard-serve"]).toBe("./dist/serve.js");
});
