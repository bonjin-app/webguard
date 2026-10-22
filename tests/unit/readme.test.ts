import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const api = () =>
  import(new URL("../../scripts/check-readmes.mjs", import.meta.url).href);
const editions = [
  "README.md",
  "README.ko.md",
  "README.ja.md",
  "README.zh-CN.md",
];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture(code = 'const url = "https://example.com/";') {
  const root = await mkdtemp(join(tmpdir(), "webguard-readmes-"));
  roots.push(root);
  await mkdir(join(root, "docs"));
  await writeFile(join(root, "docs/guide.md"), "# Guide\n");
  for (const [index, name] of editions.entries()) {
    await writeFile(
      join(root, name),
      `# WebGuard\n\n${editions.map((target) => `[${target}](${target})`).join(" · ")}\n\n## ${["Install", "설치", "インストール", "安装"][index]}\n\n[Guide](docs/guide.md)\n\n\`\`\`ts\n// ${name}\n${code}\n\`\`\`\n`,
    );
  }
  return root;
}

it("accepts translated prose and comments while preserving executable examples and links", async () => {
  const { validateReadmes } = await api();
  await expect(
    validateReadmes({ directory: await fixture() }),
  ).resolves.toMatchObject({ languages: 4, relativeLinks: 20, codeBlocks: 4 });
});

it("rejects an installation option changed in one language", async () => {
  const { validateReadmes } = await api();
  const directory = await fixture();
  const file = join(directory, "README.ja.md");
  await writeFile(
    file,
    (await readFile(file, "utf8")).replace(
      "https://example.com/",
      "https://different.example/",
    ),
  );
  await expect(validateReadmes({ directory })).rejects.toThrow(
    /README\.ja\.md.*code/i,
  );
});

it("rejects a dead relative link even when all translations share it", async () => {
  const { validateReadmes } = await api();
  const directory = await fixture();
  await rm(join(directory, "docs/guide.md"));
  await expect(validateReadmes({ directory })).rejects.toThrow(
    /docs\/guide\.md/,
  );
});

async function appendLink(directory: string, link: string) {
  for (const file of editions) {
    const path = join(directory, file);
    await writeFile(path, (await readFile(path, "utf8")) + `\n${link}\n`);
  }
}

it("rejects a stale cross-document section link even when its file exists", async () => {
  const { validateReadmes } = await api();
  const directory = await fixture();
  await appendLink(directory, "[Guide](docs/guide.md#removed-section)");
  await expect(validateReadmes({ directory })).rejects.toThrow(
    /missing.*anchor.*docs\/guide\.md#removed-section/i,
  );
});

it("checks same-document anchors without counting headings inside examples", async () => {
  const { validateReadmes } = await api();
  const directory = await fixture();
  await appendLink(
    directory,
    "```md\n## Fake target\n```\n\n[Example](#fake-target)",
  );
  await expect(validateReadmes({ directory })).rejects.toThrow(
    /missing.*anchor.*#fake-target/i,
  );
});

it("accepts encoded Unicode and duplicate heading anchors and explicit named targets", async () => {
  const { validateReadmes } = await api();
  const directory = await fixture();
  await writeFile(
    join(directory, "docs/guide.md"),
    '# Guide\n\n## `WebGuard.init()`\n\n## 설치 안내\n\n## 설치 안내\n\n<a id="stable-api"></a>\n',
  );
  await appendLink(
    directory,
    "[API](docs/guide.md#webguardinit) [설치](docs/guide.md#%EC%84%A4%EC%B9%98-%EC%95%88%EB%82%B4-1) [Stable](docs/guide.md#stable-api) [Home](#webguard)",
  );
  await expect(validateReadmes({ directory })).resolves.toMatchObject({
    languages: 4,
  });
});

it("reports malformed encoded fragments as document errors", async () => {
  const { validateReadmes } = await api();
  const directory = await fixture();
  await appendLink(directory, "[Guide](docs/guide.md#%not-an-escape)");
  await expect(validateReadmes({ directory })).rejects.toThrow(
    /invalid.*fragment/i,
  );
});

it("rejects missing language navigation and omitted install sections", async () => {
  const { validateReadmes } = await api();
  const directory = await fixture();
  const file = join(directory, "README.ko.md");
  const body = await readFile(file, "utf8");
  await writeFile(
    file,
    body.replace("[README.ja.md](README.ja.md)", "Japanese"),
  );
  await expect(validateReadmes({ directory })).rejects.toThrow(
    /README\.ko\.md.*link|navigation/i,
  );
  await writeFile(file, body.replace("## 설치", "설치"));
  await expect(validateReadmes({ directory })).rejects.toThrow(
    /README\.ko\.md.*heading/i,
  );
});

it("rejects syntax errors shared by every translation without running the example", async () => {
  const { validateReadmes } = await api();
  await expect(
    validateReadmes({ directory: await fixture("const = ;") }),
  ).rejects.toThrow(/syntax/i);
});

it("type-checks imported install options against actual package source", async () => {
  const { validateReadmes } = await api();
  const code =
    'import { webguardApp } from "uulab-webguard";\nwebguardApp({ unknownInstallOption: true });';
  await expect(
    validateReadmes({ directory: await fixture(code) }),
  ).rejects.toThrow(/unknownInstallOption/);
});

it("rejects a broken standalone CDN SDK method shared by every translation", async () => {
  const { validateReadmes } = await api();
  const directory = await fixture("WebGuardSDK.WebGuard.noSuchInit({});");
  await expect(validateReadmes({ directory })).rejects.toThrow(/noSuchInit/);
});

it("validates the real four READMEs and their public-package installation examples", async () => {
  const { validateReadmes } = await api();
  const result = await validateReadmes();
  expect(result.languages).toBe(4);
  expect(result.typedExamples).toBe(5);
  expect(result.relativeLinks).toBeGreaterThan(100);
});
