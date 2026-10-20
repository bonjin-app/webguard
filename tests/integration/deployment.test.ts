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
