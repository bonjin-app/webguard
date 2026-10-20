import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  request,
  createServer,
  type Server,
  type IncomingHttpHeaders,
} from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const roots: string[] = [];
const servers: Server[] = [];
const policy = {
  "Content-Security-Policy": "default-src 'self'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
async function create(directory: string): Promise<Server> {
  const module = (await import(
    new URL("../../examples/security-server/server.mjs", import.meta.url).href
  )) as { createProtectedServer(directory: string): Promise<Server> };
  return module.createProtectedServer(directory);
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-server-"));
  roots.push(root);
  const dist = join(root, "dist");
  await mkdir(join(dist, "assets"), { recursive: true });
  await writeFile(join(dist, "webguard-headers.json"), JSON.stringify(policy));
  await writeFile(
    join(dist, "index.html"),
    "<!doctype html><title>Protected</title>",
  );
  await writeFile(join(dist, "assets/app.js"), "globalThis.answer=42;");
  await writeFile(
    join(dist, "third-party-licenses.md"),
    "Required BSD license notices",
  );
  return { root, dist };
}
async function start(dist: string) {
  const server = await create(dist);
  expect(server.listening).toBe(false);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing loopback port");
  return address.port;
}
function get(
  port: number,
  path: string,
  method = "GET",
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path, method },
      (response) => {
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
      },
    );
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
it("starts the documented example command through a package-manager symlink", async () => {
  const { root, dist } = await fixture();
  const entry = join(root, "linked-server.mjs");
  await symlink(
    fileURLToPath(
      new URL("../../examples/security-server/server.mjs", import.meta.url),
    ),
    entry,
  );
  const reservation = createServer();
  await new Promise<void>((ready) => reservation.listen(0, "127.0.0.1", ready));
  const address = reservation.address();
  if (!address || typeof address === "string")
    throw new Error("No reserved port");
  await new Promise<void>((closed) => reservation.close(() => closed()));
  const child = spawn(
    process.execPath,
    [entry, dist, "--port", String(address.port)],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    await new Promise<void>((ready, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Linked server did not start")),
        5000,
      );
      child.stdout.on("data", (chunk) => {
        if (chunk.toString().includes("Protected static example:")) {
          clearTimeout(timeout);
          ready();
        }
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("Linked CLI exited before listening"));
      });
    });
    const result = await get(address.port, "/");
    expect(result.status).toBe(200);
    expect(result.headers["content-security-policy"]).toBe(
      policy["Content-Security-Policy"],
    );
  } finally {
    child.kill();
  }
});
it("fails startup on missing, malformed, empty, invalid, or escaped header policies", async () => {
  const { dist, root } = await fixture();
  await rm(join(dist, "webguard-headers.json"));
  await expect(create(dist)).rejects.toThrow();
  for (const contents of [
    "not json",
    "null",
    "[]",
    "{}",
    JSON.stringify({ "Content-Security-Policy": 42 }),
    JSON.stringify({ "Content-Security-Policy": "bad\r\nInjected: x" }),
  ]) {
    await writeFile(join(dist, "webguard-headers.json"), contents);
    await expect(create(dist)).rejects.toThrow();
  }
  const outside = join(root, "outside-policy.json");
  await writeFile(outside, JSON.stringify(policy));
  await rm(join(dist, "webguard-headers.json"));
  await symlink(outside, join(dist, "webguard-headers.json"));
  await expect(create(dist)).rejects.toThrow();
});
it("applies loaded policy to HTML, assets, missing files, HEAD and method errors", async () => {
  const { dist } = await fixture();
  const port = await start(dist);
  for (const path of [
    "/",
    "/assets/app.js",
    "/third-party-licenses.md",
    "/missing",
  ]) {
    const result = await get(port, path);
    expect(result.headers["content-security-policy"]).toBe(
      policy["Content-Security-Policy"],
    );
    expect(result.headers["x-content-type-options"]).toBe("nosniff");
    expect(result.headers["referrer-policy"]).toBe("no-referrer");
    expect(result.status).toBe(path === "/missing" ? 404 : 200);
  }
  expect((await get(port, "/")).headers["content-type"]).toContain("text/html");
  expect((await get(port, "/assets/app.js")).headers["content-type"]).toContain(
    "javascript",
  );
  const head = await get(port, "/assets/app.js", "HEAD");
  expect(head.status).toBe(200);
  expect(head.body).toBe("");
  expect(Number(head.headers["content-length"])).toBeGreaterThan(0);
  const post = await get(port, "/", "POST");
  expect(post.status).toBe(405);
  expect(post.headers.allow).toBe("GET, HEAD");
  expect(post.headers["content-security-policy"]).toBe(
    policy["Content-Security-Policy"],
  );
});
it("rejects source maps, development paths, encoded traversal and escaping symlinks without SPA fallbacks", async () => {
  const { dist, root } = await fixture();
  await writeFile(join(root, "secret.js"), "SECRET_OUTSIDE");
  await writeFile(join(dist, "assets/app.js.map"), "SECRET_MAP");
  await writeFile(join(dist, "source.ts"), "SECRET_SOURCE");
  await writeFile(join(dist, ".env"), "SECRET_ENV");
  await writeFile(join(dist, "vite.config.js"), "SECRET_CONFIG");
  await writeFile(join(dist, "webguard-report.json"), "SECRET_LOCAL_PATH");
  await mkdir(join(dist, "src"));
  await writeFile(join(dist, "src/legacy.js"), "SECRET_DEV");
  await symlink(join(root, "secret.js"), join(dist, "escape.js"));
  await symlink(root, join(dist, "escape-dir"));
  await symlink(join(dist, "source.ts"), join(dist, "disguised.js"));
  const port = await start(dist);
  for (const path of [
    "/assets/app.js.map",
    "/source.ts",
    "/.env",
    "/vite.config.js",
    "/src/legacy.js",
    "/webguard-headers.json",
    "/webguard-report.json",
    "/assets/",
    "/not-a-route",
    "/../secret.js",
    "/%2e%2e/secret.js",
    "/%252e%252e/secret.js",
    "/%2e%2e%2fsecret.js",
    "/%5c..%5csecret.js",
    "/escape.js",
    "/escape-dir/secret.js",
    "/disguised.js",
  ]) {
    const result = await get(port, path);
    expect(result.status, path).toBe(404);
    expect(result.body).not.toContain("SECRET");
    expect(result.headers["content-security-policy"]).toBe(
      policy["Content-Security-Policy"],
    );
  }
  for (const path of ["/%ZZ", "/%00", "http://evil.invalid/index.html"])
    expect((await get(port, path)).status, path).toBe(400);
});

it("serves physical nested directory indexes and preserves queries in canonical redirects", async () => {
  const { dist } = await fixture();
  const about = "<!doctype html><title>About page</title>";
  await mkdir(join(dist, "about/team"), { recursive: true });
  await writeFile(join(dist, "about/index.html"), about);
  await writeFile(
    join(dist, "about/team/index.html"),
    "<title>Team page</title>",
  );
  const port = await start(dist);
  for (const path of ["/about/", "/about/index.html", "/about/?lang=ko"]) {
    const response = await get(port, path);
    expect(response.status, path).toBe(200);
    expect(response.body).toBe(about);
    expect(response.headers["content-type"]).toContain("text/html");
  }
  expect((await get(port, "/about/team/")).body).toContain("Team page");
  const query = "?lang=ko&next=%2Fdocs%3Fx%3D1&word=a+b";
  for (const method of ["GET", "HEAD"]) {
    const redirect = await get(port, "/about" + query, method);
    expect(redirect.status).toBe(308);
    expect(redirect.headers.location).toBe("/about/" + query);
    expect(redirect.headers["content-security-policy"]).toBe(
      policy["Content-Security-Policy"],
    );
    if (method === "HEAD") expect(redirect.body).toBe("");
  }
  const head = await get(port, "/about/", "HEAD");
  expect(head.status).toBe(200);
  expect(head.body).toBe("");
  expect(Number(head.headers["content-length"])).toBe(Buffer.byteLength(about));
  const post = await get(port, "/about/", "POST");
  expect(post.status).toBe(405);
  expect(post.headers.allow).toBe("GET, HEAD");
  expect(post.headers.location).toBeUndefined();
  for (const path of [
    "/about/missing/",
    "/assets",
    "/about/index.html/",
    "/not-a-route",
    "/%2fabout",
  ])
    for (const method of ["GET", "HEAD"]) {
      const response = await get(port, path, method);
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(response.headers.location).toBeUndefined();
      if (method === "HEAD") expect(response.body).toBe("");
    }
});
it("validates directory aliases and index targets before redirecting or serving", async () => {
  const { dist, root } = await fixture();
  for (const path of [
    "public-page",
    "private",
    "server",
    "src",
    "masked-index",
    "outside-index",
  ])
    await mkdir(join(dist, path));
  await writeFile(
    join(dist, "public-page/index.html"),
    "<title>Public nested page</title>",
  );
  for (const path of ["private", "server", "src"])
    await writeFile(join(dist, path, "index.html"), "SECRET_PRIVATE_INDEX");
  const outside = join(root, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "index.html"), "SECRET_OUTSIDE_INDEX");
  await symlink(join(dist, "public-page"), join(dist, "public-alias"));
  await symlink(join(dist, "private"), join(dist, "hidden-alias"));
  await symlink(outside, join(dist, "outside-alias"));
  await symlink(
    join(dist, "private/index.html"),
    join(dist, "masked-index/index.html"),
  );
  await symlink(
    join(outside, "index.html"),
    join(dist, "outside-index/index.html"),
  );
  const port = await start(dist);
  expect((await get(port, "/public-alias/")).body).toContain(
    "Public nested page",
  );
  expect((await get(port, "/public-alias")).headers.location).toBe(
    "/public-alias/",
  );
  for (const path of [
    "/private",
    "/server",
    "/src",
    "/hidden-alias",
    "/outside-alias",
    "/masked-index",
    "/outside-index",
  ])
    for (const suffix of ["", "/", "/index.html"])
      for (const method of ["GET", "HEAD"]) {
        const response = await get(port, path + suffix, method);
        expect(response.status, `${method} ${path + suffix}`).toBe(404);
        expect(response.headers.location).toBeUndefined();
        expect(response.body).not.toContain("SECRET");
        expect(response.headers["content-security-policy"]).toBe(
          policy["Content-Security-Policy"],
        );
      }
});
