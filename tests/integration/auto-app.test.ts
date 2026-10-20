import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { build, createServer } from "vite";
import { webguardApp } from "@webguard/vite-plugin";
import { verifyManifest } from "@webguard/integrity";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-auto-app-"));
  roots.push(root);
  await writeFile(
    join(root, "index.html"),
    '<html><head></head><body><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(
    join(root, "main.js"),
    'const event=new KeyboardEvent("keydown",{key:"F12",bubbles:true,cancelable:true});document.dispatchEvent(event);globalThis.blockedAtAppStart=event.defaultPrevented;globalThis.message="Internal business phrase for protection";',
  );
  return root;
}
it("one plugin injects the SDK before the app, defaults to Strict and emits usable header artifacts", async () => {
  const root = await fixture();
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguardApp({ runtime: { devtools: { blockShortcuts: true } } })],
  });
  const dist = join(root, "dist");
  const report = JSON.parse(
    await readFile(join(dist, "webguard-report.json"), "utf8"),
  );
  expect(report.preset).toBe("strict");
  const assets = await readdir(join(dist, "assets"));
  const entry = assets.find((p) => p.endsWith(".js"))!;
  const code = await readFile(join(dist, "assets", entry), "utf8");
  expect(code).not.toContain("Internal business phrase for protection");
  const dom = new JSDOM("", {
    runScripts: "outside-only",
    url: "https://app.example",
  });
  try {
    runInContext(code, dom.getInternalVMContext(), { timeout: 5000 });
    expect(dom.window.blockedAtAppStart).toBe(true);
    expect(dom.window.message).toBe("Internal business phrase for protection");
  } finally {
    dom.window.close();
  }
  const headers = JSON.parse(
    await readFile(join(dist, "webguard-headers.json"), "utf8"),
  );
  expect(headers["Content-Security-Policy"]).toContain(
    "require-trusted-types-for 'script'",
  );
  expect(await readFile(join(dist, "_headers"), "utf8")).toContain(
    "  X-Content-Type-Options: nosniff",
  );
  const manifest = JSON.parse(
    await readFile(join(dist, "webguard-manifest.json"), "utf8"),
  );
  expect((await verifyManifest(dist, manifest)).valid).toBe(true);
});
it("supports explicit runtime/header opt-out and does not replace existing public header policies", async () => {
  const root = await fixture();
  await mkdir(join(root, "public"));
  await writeFile(
    join(root, "public", "_headers"),
    "/*\n  X-Frame-Options: SAMEORIGIN\n",
  );
  await expect(
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [webguardApp()],
    }),
  ).rejects.toThrow(/existing.*_headers/i);
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguardApp({ runtime: false, headers: false })],
  });
  expect(await readFile(join(root, "dist", "_headers"), "utf8")).toContain(
    "SAMEORIGIN",
  );
  const assets = await readdir(join(root, "dist", "assets"));
  const code = await readFile(
    join(
      root,
      "dist",
      "assets",
      assets.find((p) => p.endsWith(".js"))!,
    ),
    "utf8",
  );
  const dom = new JSDOM("", { runScripts: "outside-only" });
  try {
    runInContext(code, dom.getInternalVMContext(), { timeout: 5000 });
    expect(dom.window.blockedAtAppStart).toBe(false);
  } finally {
    dom.window.close();
  }
});
it("keeps development serving free of injected restrictions", async () => {
  const root = await fixture();
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguardApp({ runtime: { devtools: { blockShortcuts: true } } })],
    server: { port: 0, host: "127.0.0.1" },
  });
  try {
    await server.listen();
    const html = await server.transformIndexHtml(
      "/index.html",
      await readFile(join(root, "index.html"), "utf8"),
    );
    expect(html).not.toContain("@webguard/auto-start");
    expect(html).not.toContain("installAutoGuard");
  } finally {
    await server.close();
  }
});
it("rejects unserializable runtime callbacks and malformed configuration before building", () => {
  expect(() =>
    webguardApp({ runtime: { onThreat: () => {} } } as never),
  ).toThrow(/onThreat|serializ/i);
  expect(() =>
    webguardApp({ runtime: { devtools: { blockShortcuts: "yes" } } } as never),
  ).toThrow();
  expect(() =>
    webguardApp({ headers: { allowedOrigins: { script: ["https://*"] } } }),
  ).toThrow();
  expect(() => webguardApp({ runtime: { devtools: null } } as never)).toThrow();
  expect(() => webguardApp({ unknownOption: true } as never)).toThrow();
});

it.each([false, undefined])(
  "refuses existing header policies when Vite retains output (emptyOutDir=%s)",
  async (emptyOutDir) => {
    const root = await fixture();
    const outDir =
      emptyOutDir === false ? "dist" : `../${basename(root)}-retained`;
    const output = join(root, outDir);
    await mkdir(output, { recursive: true });
    const policy = "/*\n  X-Frame-Options: SAMEORIGIN\n";
    await writeFile(join(output, "_headers"), policy);
    try {
      await expect(
        build({
          root,
          configFile: false,
          logLevel: "silent",
          plugins: [webguardApp()],
          build: { outDir, emptyOutDir },
        }),
      ).rejects.toThrow(/existing.*_headers/i);
      expect(await readFile(join(output, "_headers"), "utf8")).toBe(policy);
    } finally {
      if (emptyOutDir === undefined)
        await rm(output, { recursive: true, force: true });
    }
  },
);
it("does not treat null preset as an omitted preset", () => {
  expect(() => webguardApp({ preset: null } as never)).toThrow(/preset/i);
});
it("refuses header assets emitted by a normal host integration plugin", async () => {
  const root = await fixture();
  await expect(
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [
        webguardApp({ runtime: false }),
        {
          name: "existing-host-policy",
          generateBundle() {
            this.emitFile({
              type: "asset",
              fileName: "_headers",
              source: "/*\n  X-Frame-Options: SAMEORIGIN\n",
            });
          },
        },
      ],
    }),
  ).rejects.toThrow(/existing.*_headers/i);
});
