import {
  createServer,
  validateHeaderName,
  validateHeaderValue,
} from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};
const inside = (root, file) => {
  const path = relative(root, file);
  return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
};
function blocked(path) {
  // Generated distribution notices are public payload, not development source.
  if (
    ["third-party-licenses.md", "/third-party-licenses.md"].includes(
      path.toLowerCase(),
    )
  )
    return false;
  const parts = path.split(/[\\/]/);
  return (
    parts.some(
      (part) =>
        part.startsWith(".") ||
        /^(?:src|node_modules|tests?|__tests__|coverage)$/i.test(part),
    ) ||
    /\.(?:map|ts|tsx|jsx|jsp|java|vue|svelte|coffee|env|md|ya?ml|toml|lock|log)$/i.test(
      path,
    ) ||
    /(?:^|\/)(?:_headers|webguard-(?:headers|report)\.json|package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(
      path,
    ) ||
    /(?:^|\/)[^/]*config\.(?:js|mjs|cjs|json)$/i.test(path)
  );
}
async function loadHeaders(root) {
  const file = await realpath(resolve(root, "webguard-headers.json"));
  if (!inside(root, file))
    throw new Error("Header policy must remain inside the served directory");
  const policy = JSON.parse(await readFile(file, "utf8"));
  if (!policy || typeof policy !== "object" || Array.isArray(policy))
    throw new Error(
      "Header policy must be an object of response header strings",
    );
  const headers = {};
  for (const [name, value] of Object.entries(policy)) {
    validateHeaderName(name);
    if (typeof value !== "string" || !value.trim())
      throw new Error("Header policy values must be non-empty strings");
    validateHeaderValue(name, value);
    const key = name.toLowerCase();
    if (Object.hasOwn(headers, key))
      throw new Error(`Duplicate header policy name: ${name}`);
    if (
      [
        "connection",
        "transfer-encoding",
        "content-length",
        "trailer",
        "upgrade",
      ].includes(key)
    )
      throw new Error("Header policy cannot control HTTP framing");
    headers[key] = value;
  }
  if (!headers["content-security-policy"])
    throw new Error("Header policy must include Content-Security-Policy");
  headers["x-content-type-options"] = "nosniff";
  return headers;
}

/** Serve a trusted, immutable build directory. The caller chooses when and where to listen. */
export async function createProtectedServer(directory) {
  const root = await realpath(resolve(directory));
  if (!(await stat(root)).isDirectory())
    throw new Error("The build directory must be a directory");
  const headers = await loadHeaders(root);
  const server = createServer(async (request, response) => {
    for (const [name, value] of Object.entries(headers))
      response.setHeader(name, value);
    const send = (status, body, type = "text/plain; charset=utf-8") => {
      response.statusCode = status;
      response.setHeader("Content-Type", type);
      response.setHeader("Content-Length", Buffer.byteLength(body));
      response.end(request.method === "HEAD" ? undefined : body);
    };
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      send(405, "Method not allowed\n");
      return;
    }
    let path;
    try {
      const raw = request.url ?? "";
      if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("#"))
        throw new Error("Invalid request target");
      decodeURIComponent(raw); // Reject malformed escapes in either the path or query.
      new URL(raw, "http://localhost");
      path = decodeURIComponent(raw.split("?")[0]);
      if (
        [...path].some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
      )
        throw new Error("Invalid path");
    } catch {
      send(400, "Bad request\n");
      return;
    }
    if (path.includes("\\") || /%[a-f\d]{2}/i.test(path) || blocked(path)) {
      send(404, "Not found\n");
      return;
    }
    try {
      const requested = resolve(root, path === "/" ? "index.html" : `.${path}`);
      if (!inside(root, requested)) {
        send(404, "Not found\n");
        return;
      }
      const file = await realpath(requested);
      if (
        !inside(root, file) ||
        blocked(relative(root, file).split(sep).join("/")) ||
        !(await stat(file)).isFile()
      ) {
        send(404, "Not found\n");
        return;
      }
      const body = await readFile(file);
      send(
        200,
        body,
        mime[extname(file).toLowerCase()] ?? "application/octet-stream",
      );
    } catch {
      send(404, "Not found\n");
    }
  });
  server.on("clientError", (_error, socket) => {
    if (socket.writable)
      socket.end(
        `HTTP/1.1 400 Bad Request\r\n${Object.entries(headers)
          .map(([key, value]) => `${key}: ${value}\r\n`)
          .join(
            "",
          )}Content-Type: text/plain; charset=utf-8\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
      );
  });
  return server;
}

if (
  process.argv[1] &&
  (await realpath(process.argv[1]).catch(() => undefined)) ===
    fileURLToPath(import.meta.url)
) {
  try {
    const [directory, ...args] = process.argv.slice(2);
    if (
      !directory ||
      (args.length && (args.length !== 2 || args[0] !== "--port"))
    )
      throw new Error(
        "Usage: node examples/security-server/server.mjs <dist> [--port 4174]",
      );
    const port = args.length ? Number(args[1]) : 4174;
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Port must be an integer from 1 to 65535");
    const server = await createProtectedServer(directory);
    await new Promise((resolveListening, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolveListening);
    });
    console.log(`Protected static example: http://127.0.0.1:${port}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
