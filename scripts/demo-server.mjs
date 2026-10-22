import { createHash } from "node:crypto";
import { validateDistribution } from "./distribution.mjs";
import { createServer } from "node:http";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProtectedServer } from "../examples/security-server/server.mjs";
import { Readable } from "node:stream";
import { handleDemoApi, handleNetworkProbe } from "../deployment/demo-api.mjs";

const mountDefinitions = [
  ["playground", "/"],
  ["docs", "/docs/"],
  ["react", "/examples/react/"],
  ["vanilla-js", "/examples/vanilla-js/"],
  ["vanilla-ts", "/examples/vanilla-ts/"],
];
/** Return a non-listening gateway. Each application retains its own static root and header policy. */
export async function createDemoServer(outputDirectory) {
  const root = await realpath(resolve(outputDirectory));
  const mounts = [];
  for (const [name, prefix] of mountDefinitions) {
    const directory = join(root, name);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(`Demo mount ${name} must be a real directory`);
    const server = await createProtectedServer(directory);
    const headers = JSON.parse(
      await readFile(join(directory, "webguard-headers.json"), "utf8"),
    );
    mounts.push({ prefix, server, headers });
  }
  // Keep validated bytes in memory so later filesystem changes cannot alter served releases.
  const distributionAssets = new Map();
  const distribution = join(root, "distribution");
  let distributionExists = false;
  try {
    await lstat(distribution);
    distributionExists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (distributionExists) {
    const { assets } = await validateDistribution(distribution);
    for (const asset of assets) {
      const bytes = await readFile(asset.file);
      if (
        bytes.length !== asset.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== asset.sha256
      )
        throw new Error("Distribution asset changed during demo startup");
      distributionAssets.set(asset.url, { bytes, headers: asset.headers });
    }
  }
  const playground = mounts[0].server;
  const gateway = createServer(async (request, response) => {
    const raw = request.url ?? "";
    try {
      if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("#"))
        throw new Error("Invalid request target");
      decodeURIComponent(raw);
    } catch {
      // Let the existing protected server generate its normal policy-bearing error.
      playground.emit("request", request, response);
      return;
    }
    const queryIndex = raw.indexOf("?");
    const path = queryIndex < 0 ? raw : raw.slice(0, queryIndex);
    const query = queryIndex < 0 ? "" : raw.slice(queryIndex);
    if (/^\/(?:cdn|downloads)(?:\/|$)/.test(path)) {
      for (const [name, value] of Object.entries(mounts[0].headers))
        response.setHeader(name, value);
      response.setHeader("X-Content-Type-Options", "nosniff");
      const asset = distributionAssets.get(path);
      if (!asset) {
        response.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end(request.method === "HEAD" ? undefined : "Not found\n");
      } else if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, {
          Allow: "GET, HEAD",
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end("Method not allowed\n");
      } else {
        response.writeHead(200, {
          ...asset.headers,
          "Content-Length": asset.bytes.length,
        });
        response.end(request.method === "HEAD" ? undefined : asset.bytes);
      }
      return;
    }
    // Match the public Worker's exact alias without enabling an SPA fallback.
    if (path === "/demo/") {
      for (const [name, value] of Object.entries(mounts[0].headers))
        response.setHeader(name, value);
      response.writeHead(308, {
        Location: "/demo" + query,
        "Content-Length": "0",
        "X-Content-Type-Options": "nosniff",
      });
      response.end();
      return;
    }
    if (path === "/demo") {
      request.url = "/demo.html" + query;
      playground.emit("request", request, response);
      return;
    }
    if (["/api/demo/quote", "/api/demo/network-probe"].includes(path)) {
      try {
        const target = new URL(raw, `http://${request.headers.host}`);
        const result = await (
          path === "/api/demo/quote" ? handleDemoApi : handleNetworkProbe
        )(
          new globalThis.Request(target, {
            method: request.method,
            headers: request.headers,
            ...(!["GET", "HEAD"].includes(request.method)
              ? {
                  body: Readable.toWeb(request),
                  duplex: "half",
                }
              : {}),
          }),
        );
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(
          request.method === "HEAD"
            ? undefined
            : Buffer.from(await result.arrayBuffer()),
        );
      } catch {
        response.writeHead(400, {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store",
        });
        response.end("Invalid demo request");
      }
      return;
    }
    for (const mount of mounts.slice(1)) {
      if (path === mount.prefix.slice(0, -1)) {
        for (const [name, value] of Object.entries(mount.headers))
          response.setHeader(name, value);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.writeHead(308, {
          Location: mount.prefix + query,
          "Content-Length": "0",
        });
        response.end();
        return;
      }
      if (path.startsWith(mount.prefix)) {
        // Use the raw request path. URL canonicalization could erase traversal segments.
        request.url = raw.slice(mount.prefix.length - 1);
        const setHeader = response.setHeader.bind(response);
        response.setHeader = (name, value) => {
          if (
            name.toLowerCase() === "location" &&
            typeof value === "string" &&
            value.startsWith("/") &&
            !value.startsWith("//")
          )
            value = mount.prefix.slice(0, -1) + value;
          return setHeader(name, value);
        };
        mount.server.emit("request", request, response);
        return;
      }
    }
    playground.emit("request", request, response);
  });
  gateway.on("clientError", (error, socket) =>
    playground.emit("clientError", error, socket),
  );
  return gateway;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== "--port"))
      throw new Error("Usage: node scripts/demo-server.mjs [--port 4173]");
    const port = args.length ? Number(args[1]) : 4173;
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Port must be an integer from 1 to 65535");
    const server = await createDemoServer(
      fileURLToPath(new URL("../.demo-dist", import.meta.url)),
    );
    await new Promise((resolveListening, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolveListening);
    });
    console.log(`WebGuard demo: http://127.0.0.1:${port}`);
  } catch (error) {
    console.error(
      `Demo startup failed: ${error.message}\nBuild it first with pnpm demo:build.`,
    );
    process.exitCode = 1;
  }
}
