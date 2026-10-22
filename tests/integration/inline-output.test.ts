import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { build } from "vite";
import { createApplicationProtector } from "../../packages/cli/src/application";
import { webguardApp } from "../../packages/vite-plugin/src/app";
import { hashContent, verifyManifest } from "@webguard/integrity";
import { chromium, firefox, webkit } from "@playwright/test";
import { createServer } from "node:http";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const protect = createApplicationProtector(async () => {
  throw new Error("No runtime requested");
});
async function fixture(source: string) {
  const root = await mkdtemp(join(tmpdir(), "webguard-inline-"));
  roots.push(root);
  const input = join(root, "input"),
    output = join(root, "protected");
  await mkdir(input);
  await writeFile(join(input, "index.html"), source);
  return { root, input, output };
}

it("protects independent classic/module blocks without moving them, changing globals or activating templates", async () => {
  const source = `<html><head></head><body>
<script data-order="first">var sharedValue = 40; let sharedLexical = 1; function sharedFunction() { return { value: sharedValue, message: "First block private phrase" }; } globalThis.order = [document.currentScript.dataset.order];</script>
<script data-order="second" defer>function nestedCalculation() { const descriptiveLocalName = sharedFunction().value + sharedLexical + 1; return descriptiveLocalName; } globalThis.answer = nestedCalculation(); globalThis.firstMessage = sharedFunction().message; order.push(document.currentScript.dataset.order);</script>
<script type="module" async data-preserved="yes">export const publicValue = "Private module phrase";</script>
<script type="application/json" id="data">{"message":"unchanged data"}</script>
<template id="inert"><script>globalThis.templateExecuted = true;</script></template>
</body></html>`;
  const { input, output } = await fixture(source);
  const report = await protect(input, {
    output,
    runtime: false,
    headers: { trustedTypes: "report-only" },
    config: {
      obfuscation: { seed: 7 },
      sourceMaps: { privateArtifacts: true },
    },
  });
  const final = await readFile(join(output, "index.html"), "utf8");
  const dom = new JSDOM(final, { runScripts: "dangerously" });
  try {
    expect(dom.window.answer).toBe(42);
    expect(dom.window.firstMessage).toBe("First block private phrase");
    expect(dom.window.order).toEqual(["first", "second"]);
    expect(dom.window.templateExecuted).toBeUndefined();
    expect(dom.window.document.querySelector("#data")!.textContent).toBe(
      '{"message":"unchanged data"}',
    );
    expect(
      dom.window.document
        .querySelector('script[type="module"]')!
        .getAttribute("data-preserved"),
    ).toBe("yes");
    expect(
      dom.window.document
        .querySelector('script[type="module"]')!
        .hasAttribute("async"),
    ).toBe(true);
    expect(
      dom.window.document
        .querySelector('script[data-order="second"]')!
        .hasAttribute("defer"),
    ).toBe(true);
    expect(final).not.toContain("descriptiveLocalName");
    expect(final).not.toContain("Private module phrase");
    const headers = JSON.parse(
      await readFile(join(output, "webguard-headers.json"), "utf8"),
    );
    const policy = dom.window.document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute("content")!;
    for (const script of dom.window.document.querySelectorAll(
      "script:not([src]):not([type='application/json'])",
    )) {
      const digest = `'${hashContent(script.textContent!)}'`;
      expect(policy).toContain(digest);
      expect(headers["Content-Security-Policy"]).toContain(digest);
      expect(headers["Content-Security-Policy-Report-Only"]).toContain(digest);
      expect(await readFile(join(output, "_headers"), "utf8")).toContain(
        digest,
      );
    }
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes/);
    expect(
      report.inlineScripts?.filter((script) => script.transformed),
    ).toHaveLength(4);
    const manifest = JSON.parse(
      await readFile(join(output, "webguard-manifest.json"), "utf8"),
    );
    expect((await verifyManifest(output, manifest)).valid).toBe(true);
    expect(await readFile(join(input, "index.html"), "utf8")).toBe(source);
  } finally {
    dom.window.close();
  }
});

it.each(["chromium", "firefox", "webkit"] as const)(
  "executes classic/module/importmap scripts under final CSP and keeps cloned templates inert in %s, then rejects changed bytes",
  async (engine) => {
    const importmap = '{ "imports": { "inline-mapped": "/mapped.js" } }';
    const { input, output } = await fixture(`<html><head></head><body>
<script>var publicGlobal=40;let sharedLexical=1;globalThis.inlineOrder=["classic-1"];</script>
<script>globalThis.classicAnswer=publicGlobal+sharedLexical+1;inlineOrder.push("classic-2");</script>
<script type="importmap">${importmap}</script>
<script type="module">import { mappedValue } from "inline-mapped";globalThis.moduleAnswer=publicGlobal+mappedValue;inlineOrder.push("module");</script>
<template><script>globalThis.clonedAnswer=publicGlobal+sharedLexical+1;</script></template>
</body></html>`);
    await writeFile(join(input, "mapped.js"), "export const mappedValue=2;");
    await protect(input, { output, runtime: false });
    const original = await readFile(join(output, "index.html"), "utf8");
    const parsed = new JSDOM(original);
    const firstScript =
      parsed.window.document.querySelector("script")!.textContent!;
    expect(
      parsed.window.document.querySelector('script[type="importmap"]')!
        .textContent,
    ).toBe(importmap);
    parsed.window.close();
    const headers = JSON.parse(
      await readFile(join(output, "webguard-headers.json"), "utf8"),
    );
    let tampered = false;
    const server = createServer(async (request, response) => {
      for (const [name, value] of Object.entries(headers))
        response.setHeader(name, value as string);
      response.setHeader("Cache-Control", "no-store");
      if (request.url === "/" || request.url === "/index.html") {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(
          tampered
            ? original.replace(firstScript, "globalThis.tamperedInline=true;")
            : original,
        );
      } else if (request.url === "/mapped.js") {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(await readFile(join(output, "mapped.js")));
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No fixture port");
    const browser = await { chromium, firefox, webkit }[engine].launch();
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as unknown as Record<string, unknown>).moduleAnswer,
          ),
        )
        .toBe(42);
      expect(
        await page.evaluate(() => {
          const state = window as unknown as Record<string, unknown>;
          return {
            answer: state.classicAnswer,
            order: state.inlineOrder,
            cloned: state.clonedAnswer,
          };
        }),
      ).toEqual({
        answer: 42,
        order: ["classic-1", "classic-2", "module"],
        cloned: undefined,
      });
      expect(errors).toEqual([]);
      await page.evaluate(() =>
        document.body.append(
          document.importNode(
            document.querySelector("template")!.content,
            true,
          ),
        ),
      );
      expect(
        await page.evaluate(
          () => (window as unknown as Record<string, unknown>).clonedAnswer,
        ),
      ).toBeUndefined();
      tampered = true;
      await page.reload();
      expect(
        await page.evaluate(() => {
          const state = window as unknown as Record<string, unknown>;
          return {
            tampered: state.tamperedInline,
            answer: state.classicAnswer,
          };
        }),
      ).toEqual({ tampered: undefined, answer: undefined });
    } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

it.each([
  ["eval", '<script>eval("globalThis.answer=42")</script>'],
  ["Function", '<script>new Function("return 42")()</script>'],
  ["string timer", '<script>setTimeout("globalThis.answer=42", 1)</script>'],
  [
    "constructed string timer",
    '<script>setTimeout("globalThis.answer=" + 42, 1)</script>',
  ],
  [
    "constant string timer",
    '<script>const action = "globalThis.answer=" + 42; setTimeout(action, 1)</script>',
  ],
  [
    "nested code string",
    '<script>const nested = "<script>run()<\\/script>";</script>',
  ],
  [
    "server template",
    '<script>globalThis.value = "<%= serverValue %>";</script>',
  ],
  [
    "Python template",
    '<script>globalThis.value = "{{ server_value }}";</script>',
  ],
  ["JSP expression", '<script>globalThis.value = "${serverValue}";</script>'],
])(
  "fails clearly on unsupported %s instead of claiming whole-script protection",
  async (_kind, source) => {
    const { input, output } = await fixture(source);
    await expect(protect(input, { output, runtime: false })).rejects.toThrow(
      /unsupported|dynamic|template/i,
    );
    await expect(readFile(join(output, "index.html"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(join(input, "index.html"), "utf8")).toBe(source);
  },
);

it("refuses to invalidate a separately managed inline CSP hash", async () => {
  const { input, output } = await fixture(
    '<meta http-equiv="Content-Security-Policy" content="script-src \'sha384-old\'"><script>globalThis.answer=42;</script>',
  );
  await expect(
    protect(input, { output, runtime: false, headers: false }),
  ).rejects.toThrow(/unmanaged|managed.*CSP/i);
});

it.each([
  'const callback=()=>{globalThis.answer=42;};function unrelated(){const callback="label";return callback;}setTimeout(callback,1);',
  'const callback="label";function run(callback){setTimeout(callback,1);}run(()=>{globalThis.answer=42;});',
])(
  "preserves function callbacks when constant names are shadowed: %s",
  async (code) => {
    const { input, output } = await fixture(`<script>${code}</script>`);
    await protect(input, { output, runtime: false });
    const dom = new JSDOM(await readFile(join(output, "index.html"), "utf8"), {
      runScripts: "dangerously",
    });
    try {
      await expect.poll(() => dom.window.answer).toBe(42);
    } finally {
      dom.window.close();
    }
  },
);

it("finalizes late Vite inline scripts and synchronizes policy after chunk and HTML transforms", async () => {
  const { input } = await fixture(
    '<html><head></head><body><script>globalThis.inlineAnswer=42;</script><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(join(input, "main.js"), "globalThis.moduleReady = true;");
  await build({
    root: input,
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    plugins: [
      webguardApp({ runtime: false }),
      {
        name: "late-inline",
        enforce: "post",
        transformIndexHtml: {
          order: "post",
          handler: () => [
            {
              tag: "script",
              children: 'globalThis.latePhrase="Private late phrase";',
              injectTo: "body",
            },
          ],
        },
      },
    ],
  });
  const output = join(input, "dist");
  const final = await readFile(join(output, "index.html"), "utf8");
  const dom = new JSDOM(final);
  const headers = JSON.parse(
    await readFile(join(output, "webguard-headers.json"), "utf8"),
  );
  try {
    expect(final).not.toContain("Private late phrase");
    for (const script of dom.window.document.querySelectorAll(
      "script:not([src])",
    ))
      expect(headers["Content-Security-Policy"]).toContain(
        `'${hashContent(script.textContent!)}'`,
      );
    const manifest = JSON.parse(
      await readFile(join(output, "webguard-manifest.json"), "utf8"),
    );
    expect((await verifyManifest(output, manifest)).valid).toBe(true);
  } finally {
    dom.window.close();
  }
});
