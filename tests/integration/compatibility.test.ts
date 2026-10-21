import { afterEach, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, createLogger } from "vite";
import { webguardApp, type WebGuardAppOptions } from "@webguard/vite-plugin";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function compile(
  source: string,
  options: WebGuardAppOptions = {},
  extension = "js",
  dependency = false,
  virtual = false,
) {
  const root = await mkdtemp(join(tmpdir(), "webguard-compatibility-"));
  roots.push(root);
  await writeFile(
    join(root, "index.html"),
    `<html><head></head><body><script type="module" src="/main.${extension}"></script></body></html>`,
  );
  await writeFile(join(root, `main.${extension}`), source);
  if (dependency) {
    const directory = join(root, "node_modules", "sink-dependency");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "sink-dependency",
        type: "module",
        exports: "./index.js",
      }),
    );
    await writeFile(
      join(directory, "index.js"),
      'document.body.innerHTML = "<p>third-party</p>";',
    );
  }
  const logger = createLogger("warn");
  const warnings: string[] = [];
  logger.warn = (message) => {
    warnings.push(message);
  };
  await build({
    root,
    configFile: false,
    customLogger: logger,
    plugins: [
      ...(virtual
        ? [
            {
              name: "test-virtual",
              resolveId(id: string) {
                if (id === "virtual:sink") return "\0virtual:sink";
              },
              load(id: string) {
                if (id === "\0virtual:sink")
                  return 'document.body.innerHTML = "<p>virtual</p>";';
              },
            },
          ]
        : []),
      webguardApp({
        runtime: false,
        obfuscation: { enabled: false },
        ...options,
      }),
    ],
  });
  for (const directory of [join(root, "dist"), join(root, "dist", "assets")]) {
    for (const filename of await readdir(directory, { withFileTypes: true })) {
      if (!filename.isFile()) continue;
      const output = await readFile(join(directory, filename.name), "utf8");
      if (/\.(?:html|js|css)$/.test(filename.name))
        expect(output).not.toContain(root);
      expect(output).not.toContain("WG_TRUSTED_TYPES_SINK");
    }
  }
  const diagnostics = warnings.filter((message) =>
    message.includes("WG_TRUSTED_TYPES_SINK"),
  );
  for (const diagnostic of diagnostics) expect(diagnostic).not.toContain(root);
  return diagnostics;
}

it("warns about potential HTML sink incompatibility in application modules", async () => {
  const warnings = await compile(
    'document.querySelector("#app").innerHTML = "<p>Hello</p>"; document.body["outerHTML"] = "<main></main>"; document.body.insertAdjacentHTML("beforeend", "<p>hello</p>"); document.write("<p>hello</p>"); document["writeln"]("<p>hello</p>");',
  );
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("main.js");
  for (const name of [
    "innerHTML",
    "outerHTML",
    "insertAdjacentHTML",
    "document.write",
    "document.writeln",
  ])
    expect(warnings[0]).toContain(name);
  expect(warnings[0]).toMatch(/potential.*runtime incompatibility/i);
  expect(warnings[0]).toContain("report-only");
  expect(warnings[0]).not.toContain("<p>Hello</p>");
  expect(warnings[0]).not.toContain("#app");
});

it("examines TypeScript after Vite transforms it into JavaScript", async () => {
  const warnings = await compile(
    'const target = document.body as HTMLElement; target["innerHTML"] = "<p>typescript</p>";',
    {},
    "ts",
  );
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("main.ts");
  expect(warnings[0]).toContain("innerHTML");
});

it("does not warn for reads, comments, string mentions or safe DOM rendering", async () => {
  const warnings = await compile(
    'const copy = document.body.innerHTML; console.log(copy, "x.innerHTML = value"); /* document.write("hello") */ const child = document.createElement("p"); child.textContent = "hello"; document.body.append(child);',
  );
  expect(warnings).toEqual([]);
});

it.each([
  false,
  { trustedTypes: "off" },
  { trustedTypes: "report-only" },
] as const)(
  "does not warn when Trusted Types enforcement is disabled: %j",
  async (headers) => {
    expect(
      await compile('document.body.innerHTML = "<p>hello</p>";', { headers }),
    ).toEqual([]);
  },
);

it("excludes dependencies", async () => {
  expect(
    await compile(
      'import "sink-dependency"; document.body.textContent = "application";',
      {},
      "js",
      true,
    ),
  ).toEqual([]);
});

it("excludes virtual application modules", async () => {
  expect(
    await compile('import "virtual:sink";', {}, "js", false, true),
  ).toEqual([]);
});

it("does not treat dynamic properties or unrelated write methods as discernible sinks", async () => {
  expect(
    await compile(
      'const key = globalThis.htmlProperty; document.body[key] = "<p>dynamic</p>"; const output = { write(value) { console.log(value); } }; output.write("hello");',
    ),
  ).toEqual([]);
});

it("keeps warnings advisory when the HTML value is produced by a policy", async () => {
  expect(
    await compile(
      'document.body.innerHTML = globalThis.appPolicy.createHTML("<p>value</p>");',
    ),
  ).toHaveLength(1);
});
