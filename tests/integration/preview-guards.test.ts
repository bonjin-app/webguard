import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import { preview, type PreviewServer, type ProxyOptions } from "vite";
import { webguardApp } from "../../packages/vite-plugin/src/app";
import { createSecurityHeaders } from "../../packages/core/src/security";
const backends: Server[] = [];
const servers: PreviewServer[] = [],
  roots: string[] = [];
afterEach(async () => {
  for (const backend of backends.splice(0)) {
    backend.closeAllConnections();
    await new Promise<void>((resolve) => backend.close(() => resolve()));
  }
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) =>
      server.httpServer.close(() => resolve()),
    );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture(
  base = "/",
  proxy?: Record<string, string | ProxyOptions>,
) {
  const root = await mkdtemp(join(tmpdir(), "webguard-preview-"));
  roots.push(root);
  await mkdir(join(root, "dist", "src"), { recursive: true });
  await writeFile(join(root, "dist/index.html"), "<h1>Protected app</h1>");
  await writeFile(join(root, "dist/src/leaked.ts"), "PRIVATE SOURCE");
  await writeFile(join(root, "dist/.env"), "PRIVATE ENV");
  await writeFile(
    join(root, "dist/webguard-headers.json"),
    JSON.stringify(createSecurityHeaders()),
  );
  await writeFile(join(root, "dist/third-party-licenses.md"), "public notice");
  await mkdir(join(root, "dist/about"));
  await writeFile(join(root, "dist/about/index.html"), "<h1>About page</h1>");
  const server = await preview({
    root,
    base,
    configFile: false,
    logLevel: "silent",
    plugins: webguardApp(),
    preview: { port: 0, host: "127.0.0.1", proxy },
  });
  servers.push(server);
  const address = server.httpServer.address();
  if (!address || typeof address === "string")
    throw Error("Missing preview port");
  return `http://127.0.0.1:${address.port}`;
}
it("automatically serves real policy headers and denies private files and SPA fallbacks in Vite preview", async () => {
  const origin = await fixture();
  const response = await fetch(origin + "/");
  expect(await response.text()).toContain("Protected app");
  expect(response.headers.get("content-security-policy")).toContain(
    "connect-src 'self'",
  );
  expect(response.headers.get("content-security-policy")).toContain(
    "require-trusted-types-for 'script'",
  );
  for (const path of [
    "/src/leaked.ts",
    "/.env",
    "/webguard-headers.json",
    "/not-present",
  ]) {
    const value = await fetch(origin + path);
    expect(value.status, path).toBe(404);
    expect(value.headers.get("x-content-type-options")).toBe("nosniff");
  }
  expect((await fetch(origin + "/third-party-licenses.md")).status).toBe(200);
  expect((await fetch(origin + "/", { method: "POST" })).status).toBe(405);
});
it("retains a Vite subpath base and does not expose the build outside its mount", async () => {
  const origin = await fixture("/app/");
  const bare = await fetch(origin + "/app?x=1", { redirect: "manual" });
  expect(bare.status).toBe(308);
  expect(bare.headers.get("location")).toBe("/app/?x=1");
  expect((await fetch(origin + "/app/")).status).toBe(200);
  expect((await fetch(origin + "/")).status).toBe(404);
  expect((await fetch(origin + "/app/src/leaked.ts")).status).toBe(404);
  const nested = await fetch(origin + "/app/about?view=1", {
    redirect: "manual",
  });
  expect(nested.status).toBe(308);
  expect(nested.headers.get("location")).toBe("/app/about/?view=1");
  expect(await (await fetch(origin + "/app/about/")).text()).toContain(
    "About page",
  );
});
it.each(["./", ""])(
  "supports Vite relative base %j without disabling preview protection",
  async (base) => {
    const origin = await fixture(base);
    const response = await fetch(origin + "/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Protected app");
    expect(response.headers.get("content-security-policy")).toContain(
      "connect-src 'self'",
    );
    expect((await fetch(origin + "/src/leaked.ts")).status).toBe(404);
  },
);
it("preserves explicitly configured API proxy routes without a static SPA fallback", async () => {
  let requests = 0;
  const backend = createServer((request, response) => {
    requests++;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ path: request.url }));
  });
  backends.push(backend);
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address();
  if (!address || typeof address === "string") throw Error("No backend port");
  const origin = await fixture("/", {
    "/api/": `http://127.0.0.1:${address.port}`,
  });
  const response = await fetch(origin + "/api/quote?amount=100");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ path: "/api/quote?amount=100" });
  expect(requests).toBe(1);
  expect((await fetch(origin + "/src/leaked.ts")).status).toBe(404);
  expect((await fetch(origin + "/unknown")).status).toBe(404);
});
it("rejects proxy bypass callbacks that could fall through to unprotected Vite static serving", async () => {
  await expect(
    fixture("/", {
      "/api": { target: "http://127.0.0.1:1", bypass: () => "/src/leaked.ts" },
    }),
  ).rejects.toThrow("proxy.bypass");
});
