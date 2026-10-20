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

function documentPolicy(html: string) {
  const dom = new JSDOM(html);
  const policies = [
    ...dom.window.document.querySelectorAll("meta[http-equiv]"),
  ].filter(
    (meta) =>
      meta.getAttribute("http-equiv")?.toLowerCase() ===
      "content-security-policy",
  );
  return { dom, policies };
}
it("places a single enforcement meta before all scripts and preload resources, including late HTML injections", async () => {
  const root = await fixture();
  await mkdir(join(root, "public"));
  await writeFile(
    join(root, "public", "host.js"),
    "globalThis.hostLoaded=true;",
  );
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [
      webguardApp({ runtime: false }),
      {
        name: "late-resource-tags",
        transformIndexHtml: {
          order: "post",
          handler() {
            return [
              {
                tag: "script",
                attrs: { type: "module", src: "/host.js" },
                injectTo: "head-prepend",
              },
              {
                tag: "link",
                attrs: { rel: "modulepreload", href: "/host.js" },
                injectTo: "head-prepend",
              },
            ];
          },
        },
      },
    ],
  });
  const html = await readFile(join(root, "dist/index.html"), "utf8");
  const { dom, policies } = documentPolicy(html);
  try {
    expect(policies).toHaveLength(1);
    const meta = policies[0]!;
    expect(meta.parentElement).toBe(dom.window.document.head);
    const content = meta.getAttribute("content")!;
    expect(content).toContain("require-trusted-types-for 'script'");
    expect(content).toContain("trusted-types 'none'");
    expect(content).not.toContain("frame-ancestors");
    for (const resource of dom.window.document.querySelectorAll(
      "script,link[rel],style,base",
    ))
      expect(
        meta.compareDocumentPosition(resource) &
          dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    const headers = JSON.parse(
      await readFile(join(root, "dist/webguard-headers.json"), "utf8"),
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
  } finally {
    dom.window.close();
  }
});
it.each(["report-only", "off"] as const)(
  "keeps Trusted Types %s behavior without enforcing it through HTML meta",
  async (trustedTypes) => {
    const root = await fixture();
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [webguardApp({ runtime: false, headers: { trustedTypes } })],
    });
    const { dom, policies } = documentPolicy(
      await readFile(join(root, "dist/index.html"), "utf8"),
    );
    try {
      expect(policies).toHaveLength(1);
      expect(policies[0]!.getAttribute("content")).toContain(
        "script-src 'self'",
      );
      expect(policies[0]!.getAttribute("content")).not.toContain(
        "trusted-types",
      );
      const headers = JSON.parse(
        await readFile(join(root, "dist/webguard-headers.json"), "utf8"),
      );
      if (trustedTypes === "report-only")
        expect(headers["Content-Security-Policy-Report-Only"]).toContain(
          "require-trusted-types-for 'script'",
        );
      else
        expect(headers["Content-Security-Policy-Report-Only"]).toBeUndefined();
    } finally {
      dom.window.close();
    }
  },
);
it("does not insert CSP meta when headers are explicitly disabled", async () => {
  const root = await fixture();
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguardApp({ headers: false })],
  });
  const { dom, policies } = documentPolicy(
    await readFile(join(root, "dist/index.html"), "utf8"),
  );
  try {
    expect(policies).toHaveLength(0);
  } finally {
    dom.window.close();
  }
  await expect(
    readFile(join(root, "dist/webguard-headers.json")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});
it.each(["source", "late HTML hook"] as const)(
  "fails closed on existing CSP meta from %s",
  async (origin) => {
    const root = await fixture();
    const policy = {
      tag: "meta",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content: "default-src 'self'",
      },
      injectTo: "head-prepend" as const,
    };
    if (origin === "source")
      await writeFile(
        join(root, "index.html"),
        '<html><head><META CONTENT="default-src &apos;self&apos;" HTTP-EQUIV="Content-Security-Policy"></head><body><script type="module" src="/main.js"></script></body></html>',
      );
    await expect(
      build({
        root,
        configFile: false,
        logLevel: "silent",
        plugins: [
          webguardApp(),
          ...(origin === "late HTML hook"
            ? [
                {
                  name: "host-csp",
                  transformIndexHtml: {
                    order: "post" as const,
                    handler() {
                      return [policy];
                    },
                  },
                },
              ]
            : []),
        ],
      }),
    ).rejects.toThrow(/existing.*CSP|CSP.*existing/i);
  },
);
it("applies CSP to every multi-page HTML entry and ignores meta-like comments and inert script data", async () => {
  const root = await fixture();
  await mkdir(join(root, "nested"));
  await writeFile(
    join(root, "nested/second.html"),
    '<html><head><!-- <meta http-equiv="Content-Security-Policy" content="default-src none"> --><script type="application/json">{"example":"<meta http-equiv=Content-Security-Policy>"}</script></head><body><script type="module" src="/main.js"></script></body></html>',
  );
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguardApp({ runtime: false })],
    build: {
      rollupOptions: {
        input: {
          main: join(root, "index.html"),
          second: join(root, "nested/second.html"),
        },
      },
    },
  });
  for (const entry of ["index.html", "nested/second.html"]) {
    const { dom, policies } = documentPolicy(
      await readFile(join(root, "dist", entry), "utf8"),
    );
    try {
      expect(policies, entry).toHaveLength(1);
    } finally {
      dom.window.close();
    }
  }
});

it.each([
  '<meta charset="UTF-8">',
  '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
])(
  "keeps a late UTF-8 declaration early before a long CSP without duplicating it: %s",
  async (declaration) => {
    const root = await fixture();
    await writeFile(
      join(root, "index.html"),
      `<html><head><link rel="preconnect" href="https://example.com"><!--${"padding".repeat(200)}-->${declaration}</head><body><p>한글 인코딩 확인</p><script type="module" src="/main.js"></script></body></html>`,
    );
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [
        webguardApp({
          runtime: false,
          headers: {
            allowedOrigins: {
              connect: Array.from(
                { length: 60 },
                (_, i) => `https://origin${i}.example.com`,
              ),
            },
          },
        }),
      ],
    });
    const html = await readFile(join(root, "dist/index.html"), "utf8");
    const { dom, policies } = documentPolicy(html);
    try {
      const declarations = dom.window.document.querySelectorAll(
        'meta[charset],meta[http-equiv="Content-Type"]',
      );
      expect(declarations).toHaveLength(1);
      const charset = declarations[0]!;
      expect(dom.window.document.head.firstElementChild === charset).toBe(true);
      expect(
        Buffer.byteLength(
          html.slice(
            0,
            html.indexOf(charset.outerHTML) + charset.outerHTML.length,
          ),
        ),
      ).toBeLessThan(1024);
      expect(charset.nextElementSibling).toBe(policies[0]);
      expect(policies[0]!.getAttribute("content")!.length).toBeGreaterThan(
        1024,
      );
      for (const resource of dom.window.document.querySelectorAll(
        "script,link,style,base",
      ))
        expect(
          policies[0]!.compareDocumentPosition(resource) &
            dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      // Decode raw bytes without an HTTP Content-Type/charset, as on a bare static host.
      const decoded = new JSDOM(Buffer.from(html, "utf8"));
      try {
        expect(decoded.window.document.body.textContent).toContain(
          "한글 인코딩 확인",
        );
      } finally {
        decoded.window.close();
      }
    } finally {
      dom.window.close();
    }
  },
);
it("adds an early UTF-8 declaration when the document lacks one", async () => {
  const root = await fixture();
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguardApp({ runtime: false })],
  });
  const { dom, policies } = documentPolicy(
    await readFile(join(root, "dist/index.html"), "utf8"),
  );
  try {
    expect(dom.window.document.head.firstElementChild?.outerHTML).toBe(
      '<meta charset="utf-8">',
    );
    expect(dom.window.document.head.firstElementChild?.nextElementSibling).toBe(
      policies[0],
    );
  } finally {
    dom.window.close();
  }
});
it.each([
  '<meta charset="">',
  '<meta charset="windows-1252">',
  '<meta http-equiv="content-type" content="text/html; charset=bogus">',
  '<meta charset="utf-8"><meta charset="windows-1252">',
])(
  "rejects malformed or ambiguous encoding declarations: %s",
  async (declaration) => {
    const root = await fixture();
    await writeFile(
      join(root, "index.html"),
      `<html><head><script type="module" src="/main.js"></script>${declaration}</head><body>한글</body></html>`,
    );
    await expect(
      build({
        root,
        configFile: false,
        logLevel: "silent",
        plugins: [webguardApp({ runtime: false })],
      }),
    ).rejects.toThrow(/charset|encoding/i);
  },
);

it("normalizes compatible UTF-8 duplicates while leaving inert template declarations untouched", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "index.html"),
    '<html><head><meta charset="UTF-8"><meta http-equiv="content-type" content="text/html; charset=utf-8"><template><meta charset="windows-1252"><meta http-equiv="Content-Security-Policy" content="default-src none"></template></head><body><script type="module" src="/main.js"></script></body></html>',
  );
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [webguardApp({ runtime: false })],
  });
  const { dom, policies } = documentPolicy(
    await readFile(join(root, "dist/index.html"), "utf8"),
  );
  try {
    expect(dom.window.document.querySelectorAll("meta[charset]")).toHaveLength(
      1,
    );
    expect(dom.window.document.head.firstElementChild?.outerHTML).toBe(
      '<meta charset="utf-8">',
    );
    expect(policies).toHaveLength(1);
    expect(
      dom.window.document
        .querySelector("template")!
        .content.querySelector("meta[charset]")!
        .getAttribute("charset"),
    ).toBe("windows-1252");
    expect(
      dom.window.document
        .querySelector("template")!
        .content.querySelectorAll("meta"),
    ).toHaveLength(2);
  } finally {
    dom.window.close();
  }
});
