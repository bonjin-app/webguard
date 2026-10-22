import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { verifyManifest, hashContent } from "@webguard/integrity";
import {
  createApplicationProtector,
  protectAppDirectory,
} from "../../packages/cli/src/application.js";

const roots: string[] = [];
const runtime = fileURLToPath(
  new URL("../../packages/browser/dist/webguard.global.js", import.meta.url),
);
const protect = createApplicationProtector(async () =>
  readFile(runtime, "utf8"),
);
const unchanged = { config: { obfuscation: { enabled: false } } };
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function file(root: string, path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
async function fixture(
  html = '<html><head><link rel="stylesheet" href="/app.css"><script src="/app.js"></script></head><body><p>한글</p></body></html>',
) {
  const root = await mkdtemp(join(tmpdir(), "webguard-application-"));
  roots.push(root);
  const input = join(root, "input"),
    output = join(root, "output");
  await file(input, "index.html", html);
  await file(input, "app.css", "p{color:blue}");
  await file(
    input,
    "app.js",
    'const event=new KeyboardEvent("keydown",{key:"F12",bubbles:true,cancelable:true});document.dispatchEvent(event);globalThis.blockedAtAppStart=event.defaultPrevented;globalThis.message="Generic application business phrase";',
  );
  return { root, input, output };
}

it("protects actual app/runtime bytes, starts the SDK before classic app code and signs final bytes", async () => {
  const { input, output } = await fixture();
  await file(
    input,
    "app.js.map",
    '{"version":3,"sourcesContent":["original"]}',
  );
  await file(input, "src/original.ts", "export const internal = true;");
  const original = await readFile(join(input, "index.html"), "utf8");
  const report = await protect(input, {
    output,
    runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
  });
  expect(report.preset).toBe("strict");
  expect(report.files.filter((f) => f.transformed).map((f) => f.path)).toEqual([
    "app.js",
    "assets/webguard-runtime.js",
  ]);
  const app = await readFile(join(output, "app.js"), "utf8");
  expect(app).not.toContain("Generic application business phrase");
  const html = await readFile(join(output, "index.html"), "utf8");
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://app.example",
  });
  try {
    const scripts = [...dom.window.document.scripts];
    expect(scripts.map((s) => s.getAttribute("src"))).toEqual([
      "/assets/webguard-runtime.js",
      "/app.js",
    ]);
    expect(scripts[0]!.hasAttribute("async")).toBe(false);
    expect(scripts[0]!.hasAttribute("defer")).toBe(false);
    expect(scripts[0]!.hasAttribute("type")).toBe(false);
    const meta = dom.window.document.querySelector(
      'meta[http-equiv="Content-Security-Policy"]',
    )!;
    expect(meta.getAttribute("content")).toContain("script-src 'self'");
    expect(meta.getAttribute("content")).not.toContain("frame-ancestors");
    expect(
      dom.window.document.head.firstElementChild?.getAttribute("charset"),
    ).toBe("utf-8");
    for (const script of scripts) {
      const code = await readFile(
        join(output, script.getAttribute("src")!.slice(1)),
        "utf8",
      );
      expect(script.getAttribute("integrity")).toBe(hashContent(code));
      runInContext(code, dom.getInternalVMContext(), { timeout: 5000 });
    }
    expect(dom.window.blockedAtAppStart).toBe(true);
    expect(dom.window.message).toBe("Generic application business phrase");
    const menu = new dom.window.Event("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    dom.window.document.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  } finally {
    dom.window.close();
  }
  expect(await readFile(join(input, "index.html"), "utf8")).toBe(original);
  await expect(readFile(join(output, "app.js.map"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(readFile(join(output, "src/original.ts"))).rejects.toMatchObject(
    { code: "ENOENT" },
  );
  const headers = JSON.parse(
    await readFile(join(output, "webguard-headers.json"), "utf8"),
  );
  expect(headers["Content-Security-Policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(await readFile(join(output, "_headers"), "utf8")).toContain(
    "  X-Content-Type-Options: nosniff",
  );
  expect(
    (
      await verifyManifest(
        output,
        JSON.parse(
          await readFile(join(output, "webguard-manifest.json"), "utf8"),
        ),
      )
    ).valid,
  ).toBe(true);
});

it("defaults shortcut and context menu restrictions off while enabling advisory detection", async () => {
  const { input, output } = await fixture();
  await protect(input, { output, ...unchanged });
  const dom = new JSDOM("", { runScripts: "outside-only" });
  try {
    runInContext(
      await readFile(join(output, "assets/webguard-runtime.js"), "utf8"),
      dom.getInternalVMContext(),
    );
    runInContext(
      await readFile(join(output, "app.js"), "utf8"),
      dom.getInternalVMContext(),
    );
    expect(dom.window.blockedAtAppStart).toBe(false);
    const guard = runInContext(
      "WebGuardSDK.installAutoGuard({})",
      dom.getInternalVMContext(),
    );
    expect(guard.getOptions()).toMatchObject({
      preset: "strict",
      devtools: { detect: true },
    });
    expect(guard.getOptions().devtools.blockShortcuts).not.toBe(true);
    expect(guard.getOptions().devtools.blockContextMenu).not.toBe(true);
  } finally {
    dom.window.close();
  }
});

it("injects one blocking runtime into every nested HTML file at the deployment base", async () => {
  const { input, output } = await fixture(
    '<script src="/site/app.js"></script>',
  );
  await file(
    input,
    "nested/second.html",
    '<script type="module" src="/site/app.js"></script>',
  );
  await protect(input, { output, publicBase: "/site/", ...unchanged });
  for (const path of ["index.html", "nested/second.html"]) {
    const dom = new JSDOM(await readFile(join(output, path), "utf8"));
    try {
      const first = dom.window.document.scripts[0]!;
      expect(first.getAttribute("src")).toBe(
        "/site/assets/webguard-runtime.js",
      );
      expect(first.getAttribute("integrity")).toMatch(/^sha384-/);
      expect(
        dom.window.document.querySelectorAll("meta[charset]"),
      ).toHaveLength(1);
    } finally {
      dom.window.close();
    }
  }
});

it("emits the runtime for template users without parsing or transforming server templates", async () => {
  const { input, output } = await fixture();
  await rm(join(input, "index.html"));
  await file(input, "view.jsp", '<%@ page language="java" %><%= secret %>');
  const report = await protect(input, { output, ...unchanged });
  expect(
    await readFile(join(output, "assets/webguard-runtime.js"), "utf8"),
  ).toContain("installAutoGuard");
  expect(report.removedSources).toContain("view.jsp");
});

it("supports managed headers and runtime opt-out without resolving a browser bundle", async () => {
  const { input, output } = await fixture(
    '<meta http-equiv="Content-Security-Policy" content="script-src &apos;self&apos; &apos;unsafe-inline&apos;"><script>globalThis.ready=true;</script>',
  );
  await file(input, "_headers", "/*\n  X-Frame-Options: SAMEORIGIN\n");
  const noRuntime = createApplicationProtector(async () => {
    throw new Error("runtime must not be loaded");
  });
  await noRuntime(input, {
    output,
    runtime: false,
    headers: false,
    ...unchanged,
  });
  expect(await readFile(join(output, "_headers"), "utf8")).toContain(
    "SAMEORIGIN",
  );
  expect(await readFile(join(output, "index.html"), "utf8")).toContain(
    "globalThis.ready=true;",
  );
  await expect(
    readFile(join(output, "assets/webguard-runtime.js")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("keeps a separately managed CSP effective before starting the runtime", async () => {
  const { input, output } = await fixture(
    '<meta http-equiv="Content-Security-Policy" content="script-src &apos;self&apos;"><script src="/app.js"></script>',
  );
  await protect(input, { output, headers: false, ...unchanged });
  const dom = new JSDOM(await readFile(join(output, "index.html"), "utf8"));
  try {
    const children = [...dom.window.document.head.children];
    expect(children.map((element) => element.tagName)).toEqual([
      "META",
      "SCRIPT",
      "SCRIPT",
    ]);
    expect(children[0]!.getAttribute("content")).toBe("script-src 'self'");
    expect(children[1]!.getAttribute("src")).toBe(
      "/assets/webguard-runtime.js",
    );
  } finally {
    dom.window.close();
  }
});

it("fails instead of starting the runtime outside a managed policy or after application scripts", async () => {
  const { input, output, root } = await fixture(
    '<script src="/app.js"></script><meta http-equiv="Content-Security-Policy" content="script-src &apos;self&apos;">',
  );
  await expect(
    protect(input, { output, headers: false, ...unchanged }),
  ).rejects.toThrow(/CSP.*scripts|CSP.*placement/i);
  expect(await readdir(root)).toEqual(["input"]);
});

it("archives maps separately and preserves an existing private artifact directory", async () => {
  const { input, output, root } = await fixture();
  const privateArtifactsDir = join(root, "private-maps");
  await file(
    input,
    "app.js.map",
    '{"version":3,"sourcesContent":["original"]}',
  );
  const report = await protect(input, {
    output,
    privateArtifactsDir,
    config: {
      sourceMaps: { privateArtifacts: true },
      obfuscation: { enabled: false },
    },
  });
  expect(report.privateArtifactsDir).toBe(privateArtifactsDir);
  expect(
    await readFile(join(privateArtifactsDir, "input-maps/app.js.map"), "utf8"),
  ).toContain("sourcesContent");
  await expect(
    protect(input, {
      output: join(root, "other-output"),
      privateArtifactsDir,
      config: { sourceMaps: { privateArtifacts: true } },
    }),
  ).rejects.toThrow(/already exists/i);
  await expect(
    readFile(join(root, "other-output", "index.html")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(
    await readFile(join(privateArtifactsDir, "input-maps/app.js.map"), "utf8"),
  ).toContain("sourcesContent");
});

it.each([
  ['<button ONCLICK="alert(1)">Run</button>', /inline.*handler/i],
  ['<a href=" java&#x0A;script:alert(1)">Run</a>', /javascript.*URL/i],
  ["<style>body{color:red}</style>", /inline.*style/i],
  ['<div style="color:red">Text</div>', /inline.*style/i],
  [
    '<meta HTTP-EQUIV="Content-Security-Policy" content="script-src none">',
    /existing.*CSP/i,
  ],
  ['<meta charset="windows-1252">', /charset|encoding/i],
  ['<base href="https://elsewhere.example/">', /base/i],
] as const)(
  "fails before publication when automatic policy would break %s",
  async (html, error) => {
    const { input, output, root } = await fixture(html);
    await expect(protect(input, { output, ...unchanged })).rejects.toThrow(
      error,
    );
    expect(await readdir(root)).toEqual(["input"]);
    expect(await readFile(join(input, "index.html"), "utf8")).toBe(html);
  },
);

it("preserves inert JSON and template content without treating them as active policies", async () => {
  const { input, output } = await fixture(
    '<script type="application/ld+json">{"name":"demo"}</script><template><meta charset="windows-1252"><meta http-equiv="Content-Security-Policy" content="none"></template><script src="/app.js"></script>',
  );
  await protect(input, { output, ...unchanged });
  const html = await readFile(join(output, "index.html"), "utf8");
  expect(html).toContain('{"name":"demo"}');
  expect(html).toContain('<template><meta charset="windows-1252">');
});

it.each([
  "_headers",
  "webguard-headers.json",
  "webguard-report.json",
  "webguard-manifest.json",
  "assets/webguard-runtime.js",
])("never replaces reserved deployment input %s", async (path) => {
  const { input, output, root } = await fixture();
  await file(input, path, "PRESERVE");
  await expect(protect(input, { output, ...unchanged })).rejects.toThrow(
    /existing|reserved/i,
  );
  expect(await readdir(root)).toEqual(["input"]);
  expect(await readFile(join(input, path), "utf8")).toBe("PRESERVE");
});

it("rejects original input/output and private-map overlap before cloning", async () => {
  const { input, root } = await fixture();
  for (const output of [input, join(input, "protected"), root])
    await expect(protect(input, { output, ...unchanged })).rejects.toThrow(
      /overlap/i,
    );
  await expect(
    protect(input, {
      output: join(root, "output"),
      privateArtifactsDir: join(input, "maps"),
      config: { sourceMaps: { privateArtifacts: true } },
    }),
  ).rejects.toThrow(/overlap|private artifacts/i);
  expect(await readdir(root)).toEqual(["input"]);
});

it("rejects symbolic links and canonical aliases without touching their targets", async () => {
  const { input, output, root } = await fixture();
  await symlink(input, join(root, "alias"));
  await expect(
    protect(input, { output: join(root, "alias", "protected"), ...unchanged }),
  ).rejects.toThrow(/overlap/i);
  await expect(
    protect(join(root, "alias"), { output, ...unchanged }),
  ).rejects.toThrow(/symbolic link/i);
  await symlink(join(input, "app.js"), join(input, "alias.js"));
  await expect(protect(input, { output, ...unchanged })).rejects.toThrow(
    /symbolic link/i,
  );
  expect(await readFile(join(input, "app.js"), "utf8")).toContain(
    "Generic application business phrase",
  );
});

it("never replaces an existing destination and removes staging after missing runtime or transform errors", async () => {
  const { input, output, root } = await fixture();
  await file(output, "keep.txt", "PRESERVE");
  await expect(protect(input, { output, ...unchanged })).rejects.toThrow(
    /already exists/i,
  );
  expect(await readFile(join(output, "keep.txt"), "utf8")).toBe("PRESERVE");
  await rm(output, { recursive: true });
  const missing = createApplicationProtector(async () =>
    readFile(join(root, "missing.js"), "utf8"),
  );
  await expect(missing(input, { output, ...unchanged })).rejects.toThrow();
  expect(await readdir(root)).toEqual(["input"]);
  await file(input, "app.js", "const = invalid;");
  await expect(protect(input, { output })).rejects.toThrow();
  expect(await readdir(root)).toEqual(["input"]);
});

it("rejects credentials even in paths that the protection pipeline later excludes", async () => {
  const { input, output, root } = await fixture();
  await file(
    input,
    "src/credentials.js",
    'export const key = "AKIA1234567890ABCDEF";',
  );
  await expect(protect(input, { output, ...unchanged })).rejects.toThrow(
    /credentials/i,
  );
  expect(await readdir(root)).toEqual(["input"]);
});

it("rejects the internal already-transformed bypass before publishing a newly injected SDK", async () => {
  const { input, output, root } = await fixture();
  await expect(
    protect(input, { output, alreadyTransformed: true } as never),
  ).rejects.toThrow(/alreadyTransformed|internal|unknown/i);
  expect(await readdir(root)).toEqual(["input"]);
});

it.each([
  { unknown: true },
  { config: { preset: null } },
  { runtime: { preset: "basic" } },
  { runtime: { onThreat: () => {} } },
  { runtime: { devtools: { blockShortcuts: "yes" } } },
  { runtime: { devtools: null } },
  { headers: { allowedOrigins: { script: ["https://*"] } } },
])("rejects malformed configuration atomically: %j", async (options) => {
  const { input, output, root } = await fixture();
  await expect(
    protect(input, { output, ...options } as never),
  ).rejects.toThrow();
  expect(await readdir(root)).toEqual(["input"]);
});

it("resolves the workspace built standalone SDK through the default API", async () => {
  const { input, output } = await fixture();
  await protectAppDirectory(input, { output, ...unchanged });
  expect(
    await readFile(join(output, "assets/webguard-runtime.js"), "utf8"),
  ).toContain("installAutoGuard");
});
