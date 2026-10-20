import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request, type Server, type IncomingHttpHeaders } from "node:http";

const roots: string[] = [];
const servers: Server[] = [];
const mounts = [
  ["playground", "/"],
  ["docs", "/docs/"],
  ["react", "/examples/react/"],
  ["vanilla-js", "/examples/vanilla-js/"],
  ["vanilla-ts", "/examples/vanilla-ts/"],
] as const;
async function create(directory: string): Promise<Server> {
  const module = (await import(
    new URL("../../scripts/demo-server.mjs", import.meta.url).href
  )) as { createDemoServer(directory: string): Promise<Server> };
  return module.createDemoServer(directory);
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-demo-"));
  roots.push(root);
  for (const [name] of mounts) {
    await mkdir(join(root, name, "assets"), { recursive: true });
    await writeFile(
      join(root, name, "index.html"),
      `<!doctype html><title>${name}</title>`,
    );
    await writeFile(
      join(root, name, "assets/app.js"),
      `globalThis.example=${JSON.stringify(name)};`,
    );
    await writeFile(
      join(root, name, "webguard-headers.json"),
      JSON.stringify({
        "Content-Security-Policy": `object-src 'none'; base-uri 'none'; frame-ancestors 'none'; report-to ${name}`,
        "X-Demo-App": name,
      }),
    );
  }
  await writeFile(join(root, "react", "assets/react-only.js"), "REACT_ONLY");
  return root;
}
async function start(root: string) {
  const server = await create(root);
  expect(server.listening).toBe(false);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing loopback address");
  return address.port;
}
it("keeps nested page redirects within the application mount", async () => {
  const root = await fixture();
  await mkdir(join(root, "vanilla-js/about"));
  await writeFile(
    join(root, "vanilla-js/about/index.html"),
    "<h1>한글 보안 체험</h1>",
  );
  const port = await start(root);
  const response = await get(port, "/examples/vanilla-js/about?view=demo");
  expect(response.status).toBe(308);
  expect(response.headers.location).toBe(
    "/examples/vanilla-js/about/?view=demo",
  );
  expect((await get(port, "/examples/vanilla-js/about/")).body).toContain(
    "한글 보안 체험",
  );
});
function get(
  port: number,
  path: string,
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () =>
        resolve({
          status: response.statusCode!,
          headers: response.headers,
          body,
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
it("serves all five app mounts with isolated assets and each app policy", async () => {
  const root = await fixture();
  const port = await start(root);
  for (const [name, prefix] of mounts) {
    const html = await get(port, `${prefix}?demo=1`);
    expect(html.status).toBe(200);
    expect(html.body).toContain(`<title>${name}</title>`);
    expect(html.headers["x-demo-app"]).toBe(name);
    const asset = await get(port, `${prefix}assets/app.js?v=1`);
    expect(asset.status).toBe(200);
    expect(asset.body).toContain(JSON.stringify(name));
    expect(asset.headers["x-demo-app"]).toBe(name);
    expect(asset.headers["content-security-policy"]).toContain(
      `report-to ${name}`,
    );
    expect(asset.headers["x-content-type-options"]).toBe("nosniff");
  }
  expect((await get(port, "/examples/react/assets/react-only.js")).status).toBe(
    200,
  );
  for (const path of [
    "/assets/react-only.js",
    "/docs/assets/react-only.js",
    "/examples/vanilla-js/assets/react-only.js",
    "/missing-route",
    "/docs/not-a-route",
    "/examples/reactish/",
  ])
    expect((await get(port, path)).status, path).toBe(404);
});
it("redirects exact mount prefixes to fixed same-origin locations while preserving raw query strings", async () => {
  const port = await start(await fixture());
  const query = "?from=%2Fdocs%2F&next=https%3A%2F%2Fevil.invalid";
  for (const [name, prefix] of mounts.filter(([, prefix]) => prefix !== "/")) {
    const response = await get(port, prefix.slice(0, -1) + query);
    expect(response.status).toBe(308);
    expect(response.headers.location).toBe(prefix + query);
    expect(response.headers["x-demo-app"]).toBe(name);
  }
});
it("rejects raw and encoded cross-mount traversal, malformed URLs and escaping asset symlinks", async () => {
  const root = await fixture();
  await symlink(
    join(root, "react", "assets/react-only.js"),
    join(root, "docs", "assets/escape.js"),
  );
  const port = await start(root);
  for (const path of [
    "/docs/../react/assets/react-only.js",
    "/docs/%2e%2e/react/assets/react-only.js",
    "/docs/%252e%252e/react/assets/react-only.js",
    "/examples/react/../vanilla-js/assets/app.js",
    "/examples/react/%2e%2e%2fvanilla-js/assets/app.js",
    "/docs/%5c..%5creact/assets/app.js",
    "/docs/assets/escape.js",
    "/../react/assets/react-only.js",
  ]) {
    const response = await get(port, path);
    expect(response.status, path).toBe(404);
    expect(response.body).not.toContain("REACT_ONLY");
  }
  for (const path of [
    "/%ZZ",
    "/docs?bad=%ZZ",
    "//evil.invalid/docs",
    "http://evil.invalid/docs",
  ])
    expect((await get(port, path)).status, path).toBe(400);
});
it("fails startup if any app or its header artifact is missing or escapes the demo tree", async () => {
  const root = await fixture();
  await rm(join(root, "vanilla-ts"), { recursive: true });
  await expect(create(root)).rejects.toThrow();
  await mkdir(join(root, "vanilla-ts"));
  await expect(create(root)).rejects.toThrow();
  await rm(join(root, "vanilla-ts"), { recursive: true });
  await symlink(join(root, "docs"), join(root, "vanilla-ts"));
  await expect(create(root)).rejects.toThrow();
});
