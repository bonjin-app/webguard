import {
  createServer,
  validateHeaderName,
  validateHeaderValue,
} from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { isPrivatePath as blocked } from "../../cli/src/private-path.mjs";

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
  // Recheck both the requested and resolved name for every directory/index/file candidate.
  async function checkedPath(candidate) {
    if (
      !inside(root, candidate) ||
      blocked(relative(root, candidate).split(sep).join("/"))
    )
      throw new Error("Non-public candidate");
    const file = await realpath(candidate);
    if (
      !inside(root, file) ||
      blocked(relative(root, file).split(sep).join("/"))
    )
      throw new Error("Non-public resolved candidate");
    return { file, info: await stat(file) };
  }
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
    let path, rawPath, query;
    try {
      const raw = request.url ?? "";
      if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("#"))
        throw new Error("Invalid request target");
      decodeURIComponent(raw); // Reject malformed escapes in either the path or query.
      new URL(raw, "http://localhost");
      const queryIndex = raw.indexOf("?");
      rawPath = queryIndex < 0 ? raw : raw.slice(0, queryIndex);
      query = queryIndex < 0 ? "" : raw.slice(queryIndex);
      path = decodeURIComponent(rawPath);
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
    if (
      path.startsWith("//") ||
      path.includes("\\") ||
      /%[a-f\d]{2}/i.test(path) ||
      blocked(path)
    ) {
      send(404, "Not found\n");
      return;
    }
    try {
      let candidate = await checkedPath(resolve(root, `.${path}`));
      if (candidate.info.isDirectory()) {
        // Check the actual index before redirecting: directory existence alone is not public.
        candidate = await checkedPath(resolve(candidate.file, "index.html"));
        if (!candidate.info.isFile()) {
          send(404, "Not found\n");
          return;
        }
        if (!rawPath.endsWith("/")) {
          const canonical =
            path
              .replace(/\/+$/, "")
              .split("/")
              .map(encodeURIComponent)
              .join("/") + "/";
          response.setHeader("Location", canonical + query);
          send(308, "Redirecting\n");
          return;
        }
      } else if (!candidate.info.isFile() || path.endsWith("/")) {
        send(404, "Not found\n");
        return;
      }
      const file = candidate.file;
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
