export interface DeploymentManifest {
  version: number;
  mounts: { prefix: string; headers: Partial<Record<string, string>> }[];
  assets: Record<string, { path: string; mount: string }>;
}
export interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

/** An exact public-file allowlist, independent of the platform's fallback routing. */
export async function handleRequest(
  request: Request,
  assets: AssetBinding,
  manifest: DeploymentManifest,
): Promise<Response> {
  let path = /^https?:\/\/[^/?#]+([^?#]*)/.exec(request.url)?.[1] || "/";
  const mount =
    manifest.mounts.find(
      (entry) =>
        entry.prefix !== "/" &&
        (path.startsWith(entry.prefix) || path === entry.prefix.slice(0, -1)),
    ) ?? manifest.mounts.find((entry) => entry.prefix === "/");
  const policy = mount?.headers ?? {
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  };
  const headersFor = (initial?: HeadersInit) => {
    const headers = new Headers(initial);
    for (const [name, value] of Object.entries(policy))
      if (value !== undefined) headers.set(name, value);
    headers.set("X-Content-Type-Options", "nosniff");
    return headers;
  };
  const error = (status: number, text: string, extra?: HeadersInit) => {
    const headers = headersFor(extra);
    headers.set("Content-Type", "text/plain; charset=utf-8");
    return new Response(request.method === "HEAD" ? null : text + "\n", {
      status,
      headers,
    });
  };
  if (!["GET", "HEAD"].includes(request.method))
    return error(405, "Method not allowed", { Allow: "GET, HEAD" });
  if (manifest.version !== 1) return error(503, "Deployment unavailable");
  // Prepared filenames are ASCII. Reject all encoded path delimiters and nested encodings.
  if (
    !/^[A-Za-z0-9_./~-]+$/.test(path) ||
    request.url.includes("#") ||
    path.split("/").some((part) => part.startsWith("."))
  )
    return error(404, "Not found");
  const url = new URL(request.url);
  if (
    (path === "/" && url.hostname === "webguard.uulab.co.kr") ||
    path === "/demo/"
  ) {
    return new Response(null, {
      status: path === "/" ? 307 : 308,
      headers: headersFor({
        Location: "/demo" + url.search,
        "Cache-Control": "no-store",
      }),
    });
  }
  // Exact entry alias only; nested paths still require the public-file allowlist.
  if (path === "/demo") path = "/";
  if (mount && mount.prefix !== "/" && path === mount.prefix.slice(0, -1)) {
    const queryIndex = request.url.indexOf("?");
    const query = queryIndex < 0 ? "" : request.url.slice(queryIndex);
    return new Response(null, {
      status: 308,
      headers: headersFor({ Location: mount.prefix + query }),
    });
  }
  if (!Object.hasOwn(manifest.assets, path)) return error(404, "Not found");
  const entry = manifest.assets[path]!;
  if (!mount || entry.mount !== mount.prefix) return error(404, "Not found");
  url.pathname = entry.path;
  try {
    const asset = await assets.fetch(new Request(url, request));
    if (asset.status === 404) return error(404, "Not found");
    if (![200, 206, 304].includes(asset.status))
      return error(502, "Asset unavailable");
    if (request.method === "HEAD" && asset.body) await asset.body.cancel();
    return new Response(
      request.method === "HEAD" || asset.status === 304 ? null : asset.body,
      {
        status: asset.status,
        statusText: asset.statusText,
        headers: headersFor(asset.headers),
      },
    );
  } catch {
    return error(502, "Asset unavailable");
  }
}
