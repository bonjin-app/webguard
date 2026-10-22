import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generatePublicGuides,
  publicGuides,
  renderGuideMarkdown,
  resolveGuideLink,
} from "../../scripts/public-guides.mjs";

describe("public static guides", () => {
  it("finishes empty ordered and unordered list items without hanging the build", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { renderGuideMarkdown } from './scripts/public-guides.mjs';
      for (const item of ['- ', '1. ']) {
        const result = renderGuideMarkdown('# Guide\\n\\n' + item + '\\n\\nNext paragraph', 'INSTALL.ko.md');
        if (!result.html.includes('Next paragraph')) throw new Error('Lost next paragraph');
      }
      console.log('completed');
    `,
      ],
      { cwd: process.cwd(), timeout: 5000, encoding: "utf8" },
    );
    expect(output.trim()).toBe("completed");
  });

  it("renders real document structure and stable Korean heading anchors", () => {
    const result = renderGuideMarkdown(
      "# 문서 제목\n\n## 9. 선택 기능: CSS 식별자와 런타임 신호\n\n안내 **강조**와 `code <tag>`를 확인합니다.\n\n```html\n<script>alert('no')</script>\n```\n\n| 환경 | 범위 |\n| --- | --- |\n| Vite | `webguardApp()` |\n\n1. 첫 단계\n2. 다음 단계\n\n- 안내 하나\n- 안내 둘\n",
      "INSTALL.ko.md",
    );
    const document = new JSDOM(result.html).window.document;
    expect(result.title).toBe("문서 제목");
    expect(document.querySelector("h2")?.id).toBe(
      "9-선택-기능-css-식별자와-런타임-신호",
    );
    expect(document.querySelector("strong")?.textContent).toBe("강조");
    expect(document.querySelector("pre code")?.textContent).toBe(
      "<script>alert('no')</script>\n",
    );
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelectorAll("th")).toHaveLength(2);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(document.querySelectorAll("ol li")).toHaveLength(2);
    expect(document.querySelectorAll("ul li")).toHaveLength(2);
  });

  it("escapes raw HTML and refuses active, encoded and ambiguous link targets", () => {
    const document = new JSDOM(
      renderGuideMarkdown(
        '# 문서\n\n<img src=x onerror=alert(1)>\n\n[실행](javascript:alert(1)) [데이터](data:text/html,test) [인코딩](javascript&#58;alert(1)) [외부](//evil.example/) [속성](https://safe.example/"onmouseover="alert(1))\n',
        "INSTALL.ko.md",
      ).html,
    ).window.document;
    expect(
      document.querySelector("img, script, [onerror], [onmouseover]"),
    ).toBeNull();
    expect(document.body.textContent).toContain("<img src=x onerror=alert(1)>");
    for (const link of document.querySelectorAll("a")) {
      expect(link.protocol).toBe("https:");
      expect(link.hasAttribute("onmouseover")).toBe(false);
    }
    expect(resolveGuideLink("../..//private", "INSTALL.ko.md")).toBeNull();
    expect(
      resolveGuideLink("https://user:secret@example.com/", "INSTALL.ko.md"),
    ).toBeNull();
  });

  it("maps guide anchors and repository examples instead of dead public Markdown paths", () => {
    expect(
      resolveGuideLink(
        "ENVIRONMENTS.ko.md#미리-압축된-파일과-배포-압축",
        "INSTALL.ko.md",
      ),
    ).toBe("/docs/ENVIRONMENTS.ko.html#미리-압축된-파일과-배포-압축");
    expect(
      resolveGuideLink("../examples/next-ssr/README.md", "INSTALL.ko.md"),
    ).toBe(
      "https://github.com/bonjin-app/webguard/blob/main/examples/next-ssr/README.md",
    );
    expect(
      resolveGuideLink(
        "evidence/next-consumer-verification.json",
        "SSR_VERIFICATION.md",
      ),
    ).toBe(
      "https://github.com/bonjin-app/webguard/blob/main/docs/evidence/next-consumer-verification.json",
    );
  });

  it("maps API reference links to complete public pages and preserves symbol anchors", () => {
    for (const [file, anchor] of [
      ["API.ko", "공개-진입점"],
      ["API_BROWSER.ko", "webguardinstancecheckintegrity"],
      ["API_BUILD.ko", "protectappdirectory"],
      ["API_INTEGRATIONS.ko", "webguardapp"],
    ]) {
      expect(resolveGuideLink(`${file}.md#${anchor}`, "API.ko.md")).toBe(
        `/docs/${file}.html#${anchor}`,
      );
    }
    expect(publicGuides.map((guide) => guide.source)).toEqual([
      "INSTALL.ko.md",
      "ENVIRONMENTS.ko.md",
      "SSR_VERIFICATION.md",
      "API.ko.md",
      "API_BROWSER.ko.md",
      "API_BUILD.ko.md",
      "API_INTEGRATIONS.ko.md",
    ]);
  });

  it("generates all complete static pages, valid local anchors, styles and unchanged text downloads", async () => {
    const output = await mkdtemp(join(tmpdir(), "webguard-guides-"));
    try {
      await generatePublicGuides({ output });
      const documents = new Map<string, Document>();
      for (const { source } of publicGuides) {
        const name = source.replace(/\.md$/, "");
        const html = await readFile(join(output, `${name}.html`), "utf8");
        const document = new JSDOM(html, {
          url: `https://webguard.uulab.co.kr/docs/${name}.html`,
        }).window.document;
        documents.set(`/docs/${name}.html`, document);
        expect(document.documentElement.lang).toBe("ko");
        expect(document.querySelector("main h1")).not.toBeNull();
        expect(
          document.querySelectorAll('.docs-outline a[aria-current="page"]'),
        ).toHaveLength(1);
        for (const guide of publicGuides) {
          expect(
            document.querySelector(
              `.docs-outline a[href="/docs/${guide.source.replace(/\.md$/, ".html")}"]`,
            ),
          ).not.toBeNull();
        }
        expect(
          document
            .querySelector('link[rel="stylesheet"]')
            ?.getAttribute("href"),
        ).toBe("/docs/guide.css");
        expect(
          document.querySelector("a[download]")?.getAttribute("href"),
        ).toBe(`/docs/${name}.txt`);
        expect(document.querySelector("script")).toBeNull();
        expect(await readFile(join(output, `${name}.txt`), "utf8")).toBe(
          await readFile(`docs/${name}.md`, "utf8"),
        );
      }
      for (const document of documents.values()) {
        for (const link of document.querySelectorAll<HTMLAnchorElement>(
          "a[href]",
        )) {
          if (link.origin !== "https://webguard.uulab.co.kr") continue;
          const target = documents.get(link.pathname);
          if (
            /^\/docs\/API(?:_BROWSER|_BUILD|_INTEGRATIONS)?\.ko\.html$/.test(
              link.pathname,
            )
          )
            expect(target, link.href).toBeDefined();
          if (target && link.hash)
            expect(
              target.getElementById(decodeURIComponent(link.hash.slice(1))),
              link.href,
            ).not.toBeNull();
          expect(link.pathname).not.toMatch(/\.md$/);
        }
      }
      expect(await readFile(join(output, "guide.css"), "utf8")).toContain(
        "--accent: #1266ff",
      );
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});
