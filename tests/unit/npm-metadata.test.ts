import { afterEach, expect, it } from "vitest";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const roots: string[] = [];
const startGuides = [
  "START_VITE.ko.md",
  "START_NEXT.ko.md",
  "START_STATIC.ko.md",
  "START_HTML.ko.md",
  "START_JAVA.ko.md",
  "START_PYTHON.ko.md",
  "START_PHP.ko.md",
  "START_CDN.ko.md",
];
const apiGuides = [
  "API.ko.md",
  "API_BROWSER.ko.md",
  "API_BUILD.ko.md",
  "API_INTEGRATIONS.ko.md",
  "OPERATIONS.ko.md",
];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
it("copies the canonical API guides into the public package beside the installation guides", async () => {
  const root = await mkdtemp(join(tmpdir(), "webguard-npm-api-guides-"));
  roots.push(root);
  const inputs: Record<string, string> = {
    LICENSE: "MIT fixture",
    "docs/INSTALL.ko.md": "install",
    "docs/ENVIRONMENTS.ko.md": "environments",
    "docs/licenses/javascript-obfuscator.txt": "fixture third party license",
    "examples/security-server/server.mjs":
      'export { createProtectedServer } from "../../packages/vite-plugin/src/static-server.mjs";\n',
    ...Object.fromEntries(
      [...apiGuides, ...startGuides].map((name) => [
        `docs/${name}`,
        `# ${name}\n\n한글 API 원본\n`,
      ]),
    ),
  };
  for (const [path, contents] of Object.entries(inputs)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  await mkdir(join(root, "scripts"));
  const script = join(root, "scripts/npm-metadata.mjs");
  await copyFile("scripts/npm-metadata.mjs", script);
  const { prepareNpmPackageMetadata } = await import(
    pathToFileURL(script).href
  );
  await prepareNpmPackageMetadata();
  for (const name of [...apiGuides, ...startGuides]) {
    expect(await readFile(join(root, "packages/npm", name), "utf8")).toBe(
      inputs[`docs/${name}`],
    );
    expect(await readFile(join(root, "docs", name), "utf8")).toBe(
      inputs[`docs/${name}`],
    );
  }
  expect(
    await readFile(join(root, "packages/npm/examples/server.mjs"), "utf8"),
  ).toContain('"../dist/server.js"');
});
