import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createManifest, verifyManifest } from "@webguard/integrity";
import {
  handleRequest,
  type DeploymentManifest,
} from "../../deployment/router";

const roots: string[] = [];
const apps = ["playground", "docs", "react", "vanilla-js", "vanilla-ts"];
const prefixes = [
  "/",
  "/docs/",
  "/examples/react/",
  "/examples/vanilla-js/",
  "/examples/vanilla-ts/",
];
async function prepare(input: string, output: string): Promise<string> {
  const module = (await import(
    new URL("../../scripts/prepare-deployment.mjs", import.meta.url).href
  )) as { prepareDeployment(input: string, output: string): Promise<string> };
  return module.prepareDeployment(input, output);
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-deploy-"));
  roots.push(root);
  const input = join(root, "input"),
    output = join(root, "output");
  for (const name of apps) {
    const directory = join(input, name);
    await mkdir(join(directory, "assets"), { recursive: true });
    await writeFile(join(directory, "index.html"), `<title>${name}</title>`);
    await writeFile(
      join(directory, "assets/app.js"),
      `globalThis.app=${JSON.stringify(name)};`,
    );
    await writeFile(
      join(directory, "webguard-headers.json"),
      JSON.stringify({
        "Content-Security-Policy": `object-src 'none'; report-to ${name}`,
        "X-App": name,
      }),
    );
    await writeFile(
      join(directory, "webguard-report.json"),
      JSON.stringify({ output: root }),
    );
    await writeFile(join(directory, "_headers"), "private control");
  }
  for (const name of apps.slice(2))
    await writeFile(
      join(input, name, "webguard-manifest.json"),
      JSON.stringify(await createManifest(join(input, name))),
    );
  return { root, input, output };
}
async function routes(output: string): Promise<DeploymentManifest> {
  return JSON.parse(await readFile(join(output, "routes.json"), "utf8"));
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
it("publishes nested index aliases and canonicalizes only existing public directories", async () => {
  const { input, output } = await fixture();
  await mkdir(join(input, "playground", "about"));
  await writeFile(
    join(input, "playground", "about", "index.html"),
    "<h1>한글 하위 페이지</h1>",
  );
  await prepare(input, output);
  const manifest = await routes(output);
  expect(manifest.assets["/about/"]).toEqual({
    path: "/about/index.html",
    mount: "/",
  });
  const assets = {
    async fetch(request: Request) {
      return new Response(
        await readFile(join(output, "public", new URL(request.url).pathname)),
      );
    },
  };
  const redirect = await handleRequest(
    new Request("https://demo.test/about?view=demo"),
    assets,
    manifest,
  );
  expect(redirect.status).toBe(308);
  expect(redirect.headers.get("location")).toBe("/about/?view=demo");
  expect(
    await (
      await handleRequest(
        new Request("https://demo.test/about/"),
        assets,
        manifest,
      )
    ).text(),
  ).toContain("한글 하위 페이지");
  for (const path of ["/missing", "//about", "/about/private", "/about%2f"])
    expect(
      (
        await handleRequest(
          new Request("https://demo.test" + path),
          assets,
          manifest,
        )
      ).status,
      path,
    ).toBe(404);
});
it("routes the exact public network fixture independently of static assets", async () => {
  const manifest: DeploymentManifest = { version: 1, mounts: [], assets: {} };
  const assets = {
    async fetch() {
      throw new Error("Fixture must not use asset fallback");
    },
  };
  const response = await handleRequest(
    new Request("https://demo.test/api/demo/network-probe", {
      headers: { Origin: "null" },
    }),
    assets,
    manifest,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ probe: "webguard-network-ok" });
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(
    (
      await handleRequest(
        new Request("https://demo.test/api/demo/network-probe/extra"),
        assets,
        manifest,
      )
    ).status,
  ).toBe(404);
});
it("stages only public payload, private route headers, and accurate sanitized integrity metadata", async () => {
  const { input, output, root } = await fixture();
  for (const [name, content] of [
    ["app.js.map", "PRIVATE_MAP"],
    ["original.ts", "PRIVATE_SOURCE"],
    ["server.js", "PRIVATE_SERVER"],
    ["server.mjs", "PRIVATE_SERVER"],
    [".env", "PRIVATE_ENV"],
    ["vite.config.js", "PRIVATE_CONFIG"],
    ["README.md", "PRIVATE_DOC"],
  ] as const)
    await writeFile(join(input, "docs", name), content);
  await mkdir(join(input, "docs", ".private"));
  await writeFile(
    join(input, "docs", ".private", "secret.json"),
    "PRIVATE_DATA",
  );
  await writeFile(
    join(input, "docs", "third-party-licenses.md"),
    "Copyright Notice",
  );
  await prepare(input, output);
  for (const name of [
    "app.js.map",
    "original.ts",
    "server.js",
    "server.mjs",
    ".env",
    "vite.config.js",
    "README.md",
    "webguard-report.json",
    "webguard-headers.json",
    "_headers",
  ]) {
    await expect(
      readFile(join(output, "public", "docs", name)),
    ).rejects.toThrow();
  }
  const manifest = await routes(output);
  expect(manifest.version).toBe(1);
  expect(manifest.assets["/"]).toMatchObject({
    path: "/index.html",
    mount: "/",
  });
  expect(manifest.assets["/docs/"]).toMatchObject({
    path: "/docs/index.html",
    mount: "/docs/",
  });
  for (const [index, name] of apps.entries()) {
    const prefix = prefixes[index]!;
    expect(
      await readFile(join(output, "public", prefix, "assets/app.js"), "utf8"),
    ).toContain(JSON.stringify(name));
    expect(
      manifest.mounts.find((mount) => mount.prefix === prefix)?.headers[
        "x-app"
      ],
    ).toBe(name);
    expect(manifest.assets[prefix + "webguard-report.json"]).toBeUndefined();
    expect(manifest.assets[prefix + "webguard-headers.json"]).toBeUndefined();
    expect(manifest.assets[prefix + "_headers"]).toBeUndefined();
  }
  expect(await readdir(join(output, "public", "docs"))).toEqual(
    expect.arrayContaining(["index.html", "assets", "third-party-licenses.md"]),
  );
  expect(await readdir(join(output, "public", "docs"))).not.toEqual(
    expect.arrayContaining(["server.js"]),
  );
  expect(JSON.stringify(manifest)).not.toContain(root);
  expect(JSON.stringify(manifest)).not.toMatch(
    /\.map|original\.ts|\.env|server\.m?js|README/,
  );
  for (const name of apps.slice(2)) {
    const directory = join(output, "public", "examples", name);
    expect(
      (
        await verifyManifest(
          directory,
          JSON.parse(
            await readFile(join(directory, "webguard-manifest.json"), "utf8"),
          ),
        )
      ).valid,
    ).toBe(true);
  }
});
it.each(["nested", "symlink ancestor", "symlink destination"])(
  "rejects overlapping output through %s without changing the input tree",
  async (kind) => {
    const { input, root } = await fixture();
    const before = (await readdir(input, { recursive: true })).sort();
    let output = join(input, "new-parent", "output");
    if (kind !== "nested") {
      const alias = join(root, "input-alias");
      await symlink(input, alias);
      output =
        kind === "symlink ancestor"
          ? join(alias, "new-parent", "output")
          : alias;
    }
    await expect(prepare(input, output)).rejects.toThrow(/must be separate/);
    expect((await readdir(input, { recursive: true })).sort()).toEqual(before);
    expect(
      (await readdir(root)).some(
        (name) =>
          name.includes("deployment-stage") ||
          name.includes("deployment-backup"),
      ),
    ).toBe(false);
  },
);
it("fails closed on changed manifests, invalid policies, or symlinks and preserves previous output", async () => {
  const { input, output, root } = await fixture();
  await mkdir(output);
  await writeFile(join(output, "keep.txt"), "PREVIOUS");
  await writeFile(join(input, "react", "assets/app.js"), "tampered");
  await expect(prepare(input, output)).rejects.toThrow(/integrity/i);
  expect(await readFile(join(output, "keep.txt"), "utf8")).toBe("PREVIOUS");
  await writeFile(
    join(input, "react", "webguard-manifest.json"),
    JSON.stringify(await createManifest(join(input, "react"))),
  );
  await writeFile(join(input, "docs", "webguard-headers.json"), "{}");
  await expect(prepare(input, output)).rejects.toThrow();
  await writeFile(
    join(input, "docs", "webguard-headers.json"),
    JSON.stringify({ "Content-Security-Policy": "object-src 'none'" }),
  );
  await symlink(
    join(root, "keep-private"),
    join(input, "playground", "assets", "escape.js"),
  );
  await expect(prepare(input, output)).rejects.toThrow(/symbolic|symlink/i);
  expect(await readFile(join(output, "keep.txt"), "utf8")).toBe("PREVIOUS");
  expect(
    (await readdir(root)).some((name) => name.includes("deployment-stage")),
  ).toBe(false);
});
it("serves only explicit allowlisted URLs with mount headers, slash redirects, HEAD and method errors", async () => {
  const { input, output } = await fixture();
  await prepare(input, output);
  const manifest = await routes(output);
  const assets = {
    async fetch(request: Request) {
      try {
        return new Response(
          await readFile(join(output, "public", new URL(request.url).pathname)),
          { headers: { "Content-Type": "text/html", "X-Asset": "yes" } },
        );
      } catch {
        return new Response("Missing", { status: 404 });
      }
    },
  };
  for (const [index, name] of apps.entries()) {
    const prefix = prefixes[index]!;
    const response = await handleRequest(
      new Request("https://demo.test" + prefix + "?x=1"),
      assets,
      manifest,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(name);
    expect(response.headers.get("x-app")).toBe(name);
    expect(response.headers.get("x-asset")).toBe("yes");
  }
  const head = await handleRequest(
    new Request("https://demo.test/docs/", { method: "HEAD" }),
    assets,
    manifest,
  );
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  const redirect = await handleRequest(
    new Request(
      "https://demo.test/examples/react?next=https%3A%2F%2Fevil.test",
    ),
    assets,
    manifest,
  );
  expect(redirect.status).toBe(308);
  expect(redirect.headers.get("location")).toBe(
    "/examples/react/?next=https%3A%2F%2Fevil.test",
  );
  expect(redirect.headers.get("x-app")).toBe("react");
  const post = await handleRequest(
    new Request("https://demo.test/docs/", { method: "POST" }),
    assets,
    manifest,
  );
  expect(post.status).toBe(405);
  expect(post.headers.get("allow")).toBe("GET, HEAD");
  expect(post.headers.get("x-app")).toBe("docs");
  for (const path of [
    "/missing",
    "/docs/app.js.map",
    "/docs/webguard-report.json",
    "/docs/webguard-headers.json",
    "/docs/README.md",
    "/docs/vite.config.js",
    "/routes.json",
    "/examples/react/assets/not-listed.js",
  ]) {
    const response = await handleRequest(
      new Request("https://demo.test" + path),
      {
        async fetch() {
          return new Response("UNRESTRICTED_BINDING");
        },
      },
      manifest,
    );
    expect(response.status, path).toBe(404);
    expect(await response.text()).not.toContain("UNRESTRICTED_BINDING");
  }
});
it("rejects encoded separators and delimiters and streams successful asset bodies", async () => {
  const { input, output } = await fixture();
  await prepare(input, output);
  const manifest = await routes(output);
  for (const path of [
    "/docs/%2findex.html",
    "/docs/%5cindex.html",
    "/docs/index.html%3fprivate",
    "/docs/index.html%23private",
    "/docs/%252e%252e/index.html",
    "/docs/%00",
    "/docs/%ZZ",
  ]) {
    const response = await handleRequest(
      new Request("https://demo.test" + path),
      {
        async fetch() {
          return new Response("BAD");
        },
      },
      manifest,
    );
    expect(response.status, path).toBe(404);
  }
  const original = new Response("streamed asset", {
    headers: { "Content-Type": "application/javascript" },
  });
  const response = await handleRequest(
    new Request("https://demo.test/docs/assets/app.js"),
    {
      async fetch() {
        return original;
      },
    },
    manifest,
  );
  expect(original.bodyUsed).toBe(false);
  expect(await response.text()).toBe("streamed asset");
  expect(response.headers.get("x-app")).toBe("docs");
});

it("serves the branded demo entry with query-preserving canonical redirects and legacy compatibility", async () => {
  const { input, output } = await fixture();
  await prepare(input, output);
  const manifest = await routes(output);
  const requested: string[] = [];
  const assets = {
    async fetch(request: Request) {
      requested.push(new URL(request.url).pathname);
      return new Response("playground", {
        headers: { "Content-Type": "text/html" },
      });
    },
  };
  for (const host of [
    "webguard.uulab.co.kr",
    "webguard-demo.uulab.workers.dev",
  ]) {
    const demo = await handleRequest(
      new Request(`https://${host}/demo?example=hello`),
      assets,
      manifest,
    );
    expect(demo.status).toBe(200);
    expect(await demo.text()).toBe("playground");
    expect(demo.headers.get("x-app")).toBe("playground");
    expect(demo.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(requested.at(-1)).toBe("/index.html");
    const slash = await handleRequest(
      new Request(`https://${host}/demo/?example=hello`),
      assets,
      manifest,
    );
    expect(slash.status).toBe(308);
    expect(slash.headers.get("location")).toBe("/demo?example=hello");
    const head = await handleRequest(
      new Request(`https://${host}/demo`, { method: "HEAD" }),
      assets,
      manifest,
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await head.text()).toBe("");
  }
  const root = await handleRequest(
    new Request("https://webguard.uulab.co.kr/?next=https%3A%2F%2Fevil.test"),
    assets,
    manifest,
  );
  expect(root.status).toBe(307);
  expect(root.headers.get("location")).toBe(
    "/demo?next=https%3A%2F%2Fevil.test",
  );
  expect(root.headers.get("cache-control")).toBe("no-store");
  const legacy = await handleRequest(
    new Request("https://webguard-demo.uulab.workers.dev/"),
    assets,
    manifest,
  );
  expect(legacy.status).toBe(200);
  for (const path of [
    "/demo/private",
    "/demo/webguard-report.json",
    "/demo%2f",
    "/demo//",
  ]) {
    const response = await handleRequest(
      new Request(`https://webguard.uulab.co.kr${path}`),
      assets,
      manifest,
    );
    expect(response.status, path).toBe(404);
  }
  const post = await handleRequest(
    new Request("https://webguard.uulab.co.kr/demo", { method: "POST" }),
    assets,
    manifest,
  );
  expect(post.status).toBe(405);
});

it("applies validated distribution headers after mount policy for GET and HEAD", async () => {
  const path = "/cdn/releases/0.3.0-0123456789abcdef/webguard.global.js";
  const manifest = {
    version: 1,
    mounts: [
      {
        prefix: "/",
        headers: {
          "Cross-Origin-Resource-Policy": "same-origin",
          "Cache-Control": "no-store",
        },
      },
    ],
    assets: {
      [path]: {
        path,
        mount: "/",
        headers: {
          "Content-Type": "text/javascript; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      },
    },
  } as DeploymentManifest;
  const binding = {
    fetch: async () =>
      new Response("SDK", {
        headers: { "Content-Type": "application/octet-stream" },
      }),
  };
  for (const method of ["GET", "HEAD"]) {
    const response = await handleRequest(
      new Request("https://demo.test" + path, { method }),
      binding,
      manifest,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "cross-origin",
    );
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(await response.text()).toBe(method === "HEAD" ? "" : "SDK");
  }
  for (const path of [
    "/cdn/catalog.json",
    "/downloads/private.txt",
    "/cdn/releases/%2e%2e/secret",
    "/downloads/releases/secret.tgz",
  ])
    expect(
      (
        await handleRequest(
          new Request("https://demo.test" + path),
          binding,
          manifest,
        )
      ).status,
    ).toBe(404);
});

async function addDistribution(input: string) {
  const { publishDistribution } = await import(
    new URL("../../scripts/distribution.mjs", import.meta.url).href
  );
  return publishDistribution(join(input, "distribution"), {
    version: "0.3.0",
    sdk: Buffer.from("var WebGuardSDK={fixture:true};"),
    packageArchive: Buffer.from("fixture package archive"),
    example: Buffer.from("WebGuardSDK.WebGuard.init({});"),
    licenses: Buffer.from("MIT notice"),
  });
}
it("stages only validated distribution files and serves downloads with exact policies", async () => {
  const { input, output } = await fixture();
  const release = await addDistribution(input);
  await prepare(input, output);
  const manifest = await routes(output);
  const binding = {
    fetch: async (request: Request) =>
      new Response(
        await readFile(join(output, "public", new URL(request.url).pathname)),
      ),
  };
  const sdk = await handleRequest(
    new Request("https://demo.test" + release.sdk.url),
    binding,
    manifest,
  );
  expect(await sdk.text()).toBe("var WebGuardSDK={fixture:true};");
  expect(sdk.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(sdk.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
  for (const url of [
    release.sdk.download,
    release.package.url,
    release.example.url,
    release.licenses.url,
  ]) {
    const response = await handleRequest(
      new Request("https://demo.test" + url),
      binding,
      manifest,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  }
  const catalog = await handleRequest(
    new Request("https://demo.test/downloads/catalog.json"),
    binding,
    manifest,
  );
  expect(catalog.headers.get("Cache-Control")).toBe("no-store");
  expect((await catalog.json()).current.id).toBe(release.id);
  for (const path of [
    "/distribution/catalog.json",
    "/downloads/releases/",
    "/downloads/private.txt",
    "/cdn/releases/" + release.id + "/private.map",
    "/downloads/%2e%2e/catalog.json",
  ])
    expect(
      (
        await handleRequest(
          new Request("https://demo.test" + path),
          binding,
          manifest,
        )
      ).status,
    ).toBe(404);
});
it("preserves previous deployment when optional distribution validation fails", async () => {
  const { input, output } = await fixture();
  const release = await addDistribution(input);
  await prepare(input, output);
  const originalRoutes = await readFile(join(output, "routes.json"));
  const originalSdk = await readFile(join(output, "public", release.sdk.url));
  await writeFile(
    join(input, "distribution/releases", release.id, "webguard.global.js"),
    "tampered",
  );
  await expect(prepare(input, output)).rejects.toThrow(
    /integrity|digest|size/i,
  );
  expect(await readFile(join(output, "routes.json"))).toEqual(originalRoutes);
  expect(await readFile(join(output, "public", release.sdk.url))).toEqual(
    originalSdk,
  );
});
