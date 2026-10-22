import { afterEach, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { verifyDeployment } from "../../packages/cli/src/remote";
import { hashContent } from "@webguard/integrity";
const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
});

it("reports network failures per asset and continues checking remaining paths", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(null))
    .mockRejectedValueOnce(new TypeError("fetch failed"))
    .mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", request);
  const result = await verifyDeployment("https://example.com/app/", manifest);
  expect(result.valid).toBe(false);
  expect(result.checked).toBe(17);
  expect(result.errors).toContain("Unable to check deployed asset: main.js");
});

it("validates every path before issuing any requests, including URL schemes", async () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await expect(
    verifyDeployment("https://example.com/app/", manifest, ["https:other.js"]),
  ).rejects.toThrow("Unsafe deployment path");
  expect(request).not.toHaveBeenCalled();
});

it("checks generated headers on the entry route, assets and missing source responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL) => {
      if (input.pathname.endsWith("main.js"))
        return new Response("globalThis.ok=true;", {
          headers: { "X-Content-Type-Options": "nosniff" },
        });
      return new Response(null, {
        status: /\.(?:map|gz|br)$/.test(input.pathname) ? 404 : 200,
      });
    }),
  );
  const result = await verifyDeployment(
    "https://example.com/app/",
    manifest,
    [],
    {
      expectedHeaders: {
        "Content-Security-Policy": "default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
  expect(result.checked).toBe(17);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain(
    "Missing response header on /: Content-Security-Policy",
  );
  expect(result.errors).toContain(
    "Missing response header on main.js: Content-Security-Policy",
  );
  expect(result.errors).toContain(
    "Missing response header on main.js.map: X-Content-Type-Options",
  );
});

it("cancels an oversized response instead of buffering an unbounded deployment body", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(100));
    },
    cancel,
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(new Response(stream))
      .mockResolvedValue(new Response(null, { status: 404 })),
  );
  const result = await verifyDeployment("https://example.com/", manifest);
  expect(result.errors).toContain("Deployed size exceeds manifest: main.js");
  expect(cancel).toHaveBeenCalledOnce();
});

it("rejects a changed CSP value even when the header name is present", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (input: URL) =>
        new Response(
          input.pathname.endsWith("main.js") ? "globalThis.ok=true;" : null,
          {
            status: /\.(?:map|gz|br)$/.test(input.pathname) ? 404 : 200,
            headers: {
              "Content-Security-Policy":
                "default-src *; script-src 'unsafe-inline'",
            },
          },
        ),
    ),
  );
  const result = await verifyDeployment("https://example.com/", manifest, [], {
    expectedHeaders: { "Content-Security-Policy": "default-src 'none'" },
  });
  expect(result.errors).toContain(
    "Response header mismatch on main.js: Content-Security-Policy",
  );
  expect(result.valid).toBe(false);
});

it("records HTTP timeout as a failed check and completes the source probes", async () => {
  const s = createServer((req, res) => {
    if (/\.(?:map|gz|br)$/.test(req.url ?? "")) {
      res.statusCode = 404;
      res.end();
    }
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const address = s.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  const result = await verifyDeployment(
    `http://127.0.0.1:${address.port}/`,
    manifest,
    [],
    { timeoutMs: 50 },
  );
  expect(result).toMatchObject({ valid: false, checked: 17 });
  expect(result.errors).toContain("Unable to check deployed asset: main.js");
  s.closeAllConnections();
});
async function server(fallback = false) {
  const s = createServer((req, res) => {
    if (req.url === "/app/") {
      res.end("<html>Deployment entry</html>");
      return;
    }
    if (req.url === "/app/main.js") {
      res.end("globalThis.ok=true;");
      return;
    }
    if (fallback) {
      res.setHeader("content-type", "text/html");
      res.end("<html>SPA fallback</html>");
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const addr = s.address();
  if (!addr || typeof addr === "string") throw Error("Missing port");
  return `http://127.0.0.1:${addr.port}/app/`;
}
const manifest = {
  version: 1 as const,
  algorithm: "sha384" as const,
  files: {
    "main.js": { integrity: hashContent("globalThis.ok=true;"), size: 19 },
  },
};
it.each([
  ["main.js", ".bak"],
  ["main.js", "~"],
  ["main.js", ".gz"],
  ["main.js", ".br"],
  ["main.js", ".gz.gz"],
  ["main.js", ".gz.br"],
  ["main.js", ".br.gz"],
  ["main.js", ".br.br"],
  ["main.mjs", ".gz"],
  ["main.cjs", ".br"],
  ["main.css", ".gz.br"],
])(
  "rejects exposed compressed code %s%s while the public asset matches its trusted hash",
  async (asset, suffix) => {
    const finalCode = "globalThis.x=42;";
    let original: Uint8Array = Buffer.from(
      "globalThis.descriptiveOriginalSourceMarker=42;",
    );
    for (const encoding of suffix
      .split(".")
      .filter((value) => value === "gz" || value === "br"))
      original =
        encoding === "gz" ? gzipSync(original) : brotliCompressSync(original);
    const sidecar = asset + suffix;
    const requests: string[] = [];
    const s = createServer((request, response) => {
      requests.push(request.url ?? "");
      if (request.url === "/app/") response.end("Public entry");
      else if (request.url === `/app/${asset}`) response.end(finalCode);
      else if (request.url === `/app/${sidecar}`) response.end(original);
      else {
        response.statusCode = 404;
        response.end();
      }
    });
    servers.push(s);
    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    const address = s.address();
    if (!address || typeof address === "string") throw Error("Missing port");
    const result = await verifyDeployment(
      `http://127.0.0.1:${address.port}/app/`,
      {
        ...manifest,
        files: {
          [asset]: {
            integrity: hashContent(finalCode),
            size: Buffer.byteLength(finalCode),
          },
        },
      },
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(sidecar);
    expect(requests).toContain(`/app/${sidecar}`);
    // The valid public asset must not also become an absence probe.
    expect(requests.filter((path) => path === `/app/${asset}`)).toHaveLength(1);
  },
);
it("compares deployed bytes and confirms source-map URL absence", async () => {
  const result = await verifyDeployment(await server(), manifest, ["main.ts"]);
  expect(result).toEqual({ valid: true, errors: [], checked: 24 });
});
it("does not mistake successful SPA fallback URLs for confirmed source-map absence", async () => {
  const result = await verifyDeployment(await server(true), manifest);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain(
    "Source URL responds successfully (review SPA fallbacks): main.js.map",
  );
});
it("reports byte changes against locally trusted hashes", async () => {
  const result = await verifyDeployment(await server(), {
    ...manifest,
    files: { "main.js": { integrity: hashContent("different"), size: 19 } },
  });
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Deployed hash mismatch: main.js");
});

async function entryServer(rootBody: string, rootStatus = 200) {
  const html = "<html><script src='main.js'></script></html>";
  const s = createServer((req, res) => {
    if (req.url === "/app/") {
      res.statusCode = rootStatus;
      res.end(rootBody);
    } else if (req.url === "/app/index.html") res.end(html);
    else if (req.url === "/app/main.js") res.end("globalThis.ok=true;");
    else {
      res.statusCode = 404;
      res.end();
    }
  });
  servers.push(s);
  await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
  const address = s.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  return {
    base: `http://127.0.0.1:${address.port}/app/`,
    manifest: {
      ...manifest,
      files: {
        ...manifest.files,
        "index.html": {
          integrity: hashContent(html),
          size: Buffer.byteLength(html),
        },
      },
    },
    html,
  };
}

it("rejects a tampered mount root even when index.html and assets match without header checks", async () => {
  const deployed = await entryServer("<html>tampered</html>");
  const result = await verifyDeployment(deployed.base, deployed.manifest);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Deployed hash mismatch: /");
  expect(result.checked).toBe(18);
});

it("rejects an unsuccessful mount root even when index.html and assets match", async () => {
  const deployed = await entryServer("failure", 500);
  const result = await verifyDeployment(deployed.base, deployed.manifest);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain(
    "Deployment entry does not respond successfully (500)",
  );
});

it("checks mount root status even when the manifest has no index.html", async () => {
  const deployed = await entryServer("missing", 404);
  const result = await verifyDeployment(deployed.base, manifest);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain(
    "Deployment entry does not respond successfully (404)",
  );
  expect(result.checked).toBe(17);
});

it("accepts matching mount root and assets without optional header comparisons", async () => {
  const html = "<html><script src='main.js'></script></html>";
  const deployed = await entryServer(html);
  expect(await verifyDeployment(deployed.base, deployed.manifest)).toEqual({
    valid: true,
    errors: [],
    checked: 18,
  });
});
