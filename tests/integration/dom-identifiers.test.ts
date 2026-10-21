import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { build } from "vite";
import { webguardApp } from "@webguard/vite-plugin";
import { createDomIdentifierGenerator } from "../../packages/cli/src/dom-identifiers";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-css-modules-"));
  roots.push(root);
  await writeFile(
    join(root, "index.html"),
    '<html><body><div id="target" class="global-selector"></div><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(
    join(root, "main.js"),
    'import styles from "./payment.module.css"; document.querySelector("#target").classList.add(styles.paymentTotal); globalThis.exportedClass=styles.paymentTotal;',
  );
  await writeFile(
    join(root, "payment.module.css"),
    ".paymentTotal { color: rgb(37, 99, 235); } :global(.global-selector) { display: block; }",
  );
  return root;
}
it("real Vite CSS output and JS class mapping agree, while global selectors and IDs remain stable", async () => {
  const root = await fixture();
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [
      webguardApp({
        domIdentifiers: true,
        headers: false,
        runtime: false,
        preset: "basic",
      }),
    ],
  });
  const files = await readdir(join(root, "dist/assets"));
  const css = await readFile(
    join(
      root,
      "dist/assets",
      files.find((name) => name.endsWith(".css"))!,
    ),
    "utf8",
  );
  const code = await readFile(
    join(
      root,
      "dist/assets",
      files.find((name) => name.endsWith(".js"))!,
    ),
    "utf8",
  );
  const name = createDomIdentifierGenerator({ root })(
    "paymentTotal",
    join(root, "payment.module.css"),
  );
  expect(css).toContain("." + name);
  expect(css).not.toContain("paymentTotal");
  expect(css).toContain(".global-selector");
  const dom = new JSDOM('<div id="target" class="global-selector"></div>', {
    runScripts: "outside-only",
  });
  try {
    runInContext(code, dom.getInternalVMContext());
    expect(dom.window.document.querySelector("#target")!.className).toBe(
      "global-selector " + name,
    );
    expect(dom.window.exportedClass).toBe(name);
  } finally {
    dom.window.close();
  }
});
it("fails explicitly for existing CSS naming, disabled modules and Lightning CSS", async () => {
  const root = await fixture();
  for (const css of [
    { modules: { generateScopedName: "[local]" } },
    { modules: false as const },
    { transformer: "lightningcss" as const },
  ])
    await expect(
      build({
        root,
        configFile: false,
        logLevel: "silent",
        css,
        plugins: [
          webguardApp({ domIdentifiers: true, runtime: false, headers: false }),
        ],
      }),
    ).rejects.toThrow(/domIdentifiers/);
});

it("uses identical names through a filesystem symlink", async () => {
  const root = await fixture();
  const container = await mkdtemp(join(tmpdir(), "webguard-css-link-"));
  roots.push(container);
  const linked = join(container, "linked");
  await symlink(root, linked, "dir");
  expect(
    createDomIdentifierGenerator({ root: linked })(
      "paymentTotal",
      join(linked, "payment.module.css"),
    ),
  ).toBe(
    createDomIdentifierGenerator({ root })(
      "paymentTotal",
      join(root, "payment.module.css"),
    ),
  );
});
