import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { posix, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const repository = "https://github.com/bonjin-app/webguard/blob/main/";
const root = fileURLToPath(new URL("../", import.meta.url));
export const publicGuides = [
  { source: "INSTALL.ko.md", label: "설치·적용 전체 가이드" },
  { source: "ENVIRONMENTS.ko.md", label: "환경별 적용 가이드" },
  { source: "SSR_VERIFICATION.md", label: "SSR 검증 기록" },
  { source: "API.ko.md", label: "API 명세 전체 목차" },
  { source: "API_BROWSER.ko.md", label: "브라우저 런타임 API" },
  { source: "API_BUILD.ko.md", label: "Node 빌드·검증 API" },
  { source: "API_INTEGRATIONS.ko.md", label: "연동·CLI API" },
  {
    source: "START_VITE.ko.md",
    label: "Vite · React · Vue",
    category: "environment",
  },
  { source: "START_NEXT.ko.md", label: "Next.js", category: "environment" },
  {
    source: "START_STATIC.ko.md",
    label: "Webpack · esbuild",
    category: "environment",
  },
  {
    source: "START_HTML.ko.md",
    label: "일반 HTML · jQuery",
    category: "environment",
  },
  { source: "START_JAVA.ko.md", label: "Java · JSP", category: "environment" },
  { source: "START_PYTHON.ko.md", label: "Python", category: "environment" },
  { source: "START_PHP.ko.md", label: "PHP", category: "environment" },
  {
    source: "START_CDN.ko.md",
    label: "CDN · 직접 SDK",
    category: "environment",
  },
];
const pagePath = (source) => `/docs/${source.replace(/\.md$/, ".html")}`;
const escapeHtml = (text) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

/** Only explicit HTTP(S), document anchors and repository-relative links are emitted. */
export function resolveGuideLink(href, sourceFile) {
  if (
    !href ||
    [...href].some(
      (character) =>
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127 ||
        character === "\\",
    ) ||
    href.startsWith("//")
  )
    return null;
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      return url.username || url.password ? null : url.href;
    } catch {
      return null;
    }
  }
  if (href.startsWith("#")) return href;
  if (/[?:&]/.test(href) || href.startsWith("/")) return null;
  const hash = href.indexOf("#");
  const path = hash < 0 ? href : href.slice(0, hash);
  const fragment = hash < 0 ? "" : href.slice(hash);
  // Do not decode URL escapes into filesystem paths or allow traversal out of the repo.
  if (path.includes("%")) return null;
  const resolved = posix.normalize(
    posix.join("docs", posix.dirname(sourceFile), path),
  );
  if (resolved === ".." || resolved.startsWith("../")) return null;
  const guide = publicGuides.find((item) => `docs/${item.source}` === resolved);
  return guide
    ? pagePath(guide.source) + fragment
    : repository +
        resolved.split("/").map(encodeURIComponent).join("/") +
        fragment;
}

// This is a deliberately bounded Markdown renderer, not a general HTML/Markdown parser.
// Unsupported syntax stays escaped text. All tag/attribute names below are fixed literals.
function inline(text, sourceFile, links, depth = 0) {
  if (depth > 8) return escapeHtml(text);
  let html = "";
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index);
    const code = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest);
    if (code) {
      html += `<code>${escapeHtml(code[2])}</code>`;
      index += code[0].length;
      continue;
    }
    if (rest.startsWith("**")) {
      const end = rest.indexOf("**", 2);
      if (end > 2) {
        html += `<strong>${inline(rest.slice(2, end), sourceFile, links, depth + 1)}</strong>`;
        index += end + 2;
        continue;
      }
    }
    const label = /^\[([^\]\n]+)\]\(/.exec(rest);
    if (label) {
      let cursor = label[0].length,
        balance = 1;
      for (; cursor < rest.length && balance; cursor++) {
        if (rest[cursor] === "(") balance++;
        if (rest[cursor] === ")") balance--;
      }
      if (!balance) {
        const href = resolveGuideLink(
          rest.slice(label[0].length, cursor - 1),
          sourceFile,
        );
        const content = inline(label[1], sourceFile, links, depth + 1);
        html += href ? `<a href="${escapeHtml(href)}">${content}</a>` : content;
        if (href) links.push(href);
        index += cursor;
        continue;
      }
    }
    html += escapeHtml(text[index]);
    index++;
  }
  return html;
}

function tableCells(line) {
  // Pipes in inline code and escaped pipes are content, not column boundaries.
  const cells = [];
  let cell = "",
    code = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === "\\" && line[index + 1] === "|") {
      cell += "|";
      index++;
    } else if (character === "`") {
      code = !code;
      cell += character;
    } else if (character === "|" && !code) {
      cells.push(cell.trim());
      cell = "";
    } else cell += character;
  }
  cells.push(cell.trim());
  if (line.trimStart().startsWith("|")) cells.shift();
  if (line.trimEnd().endsWith("|")) cells.pop();
  return cells;
}
const isTableDivider = (line) =>
  line?.includes("|") &&
  tableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
const headingSlug = (text) =>
  text
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");

export function renderGuideMarkdown(markdown, sourceFile) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const headings = [],
    links = [],
    usedIds = new Set();
  const html = [];
  let title = "WebGuard 가이드";
  const renderInline = (text) => inline(text, sourceFile, links);
  const startsBlock = (index) =>
    /^(#{1,6})\s|^(`{3,}|~{3,})|^\s*([-*+] |\d+\. )|^>/.test(lines[index]) ||
    isTableDivider(lines[index + 1]);
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }
    const fence = /^(`{3,}|~{3,})([^\s]*)\s*$/.exec(line);
    if (fence) {
      const content = [];
      index++;
      while (
        index < lines.length &&
        !new RegExp(`^${fence[1][0]}{${fence[1].length},}\\s*$`).test(
          lines[index],
        )
      )
        content.push(lines[index++]);
      if (index < lines.length) index++;
      html.push(
        `<pre tabindex="0" aria-label="코드 예제"><code>${escapeHtml(content.join("\n") + "\n")}</code></pre>`,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].replace(/[`*]/g, "");
      const base = headingSlug(text) || "section";
      let id = base,
        suffix = 1;
      while (usedIds.has(id)) id = `${base}-${suffix++}`;
      usedIds.add(id);
      headings.push({ level, text, id });
      if (level === 1) title = text;
      html.push(
        `<h${level} id="${escapeHtml(id)}">${renderInline(heading[2])}</h${level}>`,
      );
      index++;
      continue;
    }
    if (isTableDivider(lines[index + 1])) {
      const headers = tableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith("|"))
        rows.push(tableCells(lines[index++]));
      html.push(
        `<div class="table-scroll" role="region" aria-label="가이드 비교표" tabindex="0"><table><thead><tr>${headers.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cell) => `<td>${renderInline(row[cell] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
      continue;
    }
    const list = /^\s*([-*+]|\d+\.)\s+/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const tag = ordered ? "ol" : "ul",
        items = [];
      while (index < lines.length) {
        const item = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(lines[index]);
        if (!item || /\d/.test(item[1]) !== ordered) break;
        items.push(`<li>${renderInline(item[2])}</li>`);
        index++;
      }
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    if (line.startsWith(">")) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith(">"))
        quote.push(lines[index++].replace(/^>\s?/, ""));
      html.push(
        `<blockquote><p>${renderInline(quote.join(" "))}</p></blockquote>`,
      );
      continue;
    }
    const paragraph = [line];
    index++;
    while (index < lines.length && lines[index].trim() && !startsBlock(index))
      paragraph.push(lines[index++]);
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }
  return { html: html.join("\n"), title, headings, links };
}

function guidePage(guide, result) {
  const path = pagePath(guide.source);
  const download = path.replace(/\.html$/, ".txt");
  const environment = guide.category === "environment";
  const category = environment ? "환경별 시작" : "상세 가이드";
  const navLinks = (items) =>
    items
      .map(
        (item) =>
          `<a href="${pagePath(item.source)}"${item.source === guide.source ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`,
      )
      .join("");
  const toc = result.headings
    .filter((item) => item.level === 2)
    .map(
      (item) =>
        `<a href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a>`,
    )
    .join("");
  const nav = `<a class="guide-nav-back" href="/docs/#install">환경 선택으로 돌아가기</a><div class="guide-nav-group guide-nav-toc"><span>이 문서의 목차</span>${toc}</div><details class="guide-nav-group guide-nav-environments"${environment ? " open" : ""}><summary>다른 환경의 설치 방법</summary>${navLinks(publicGuides.filter((item) => item.category === "environment"))}</details><details class="guide-nav-group guide-nav-reference"${environment ? "" : " open"}><summary>상세 가이드 · API 명세</summary>${navLinks(publicGuides.filter((item) => item.category !== "environment"))}</details>`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#edf8ff"><title>${escapeHtml(result.title)} — WebGuard</title><meta name="description" content="${escapeHtml(guide.label)}: WebGuard의 설치, 적용 방법과 검증 범위를 확인하세요."><link rel="canonical" href="https://webguard.uulab.co.kr${path}"><link rel="icon" type="image/svg+xml" href="/docs/favicon.svg"><link rel="stylesheet" href="/docs/guide.css"></head>
<body class="guide-page"><a class="skip-link" href="#main-content">본문으로 건너뛰기</a><header class="docs-header"><a href="/docs/" class="docs-brand" aria-label="WebGuard 개발자 가이드 홈"><img class="docs-logo" src="/docs/favicon.svg" alt="" width="36" height="36"><span>WebGuard</span><span class="docs-badge">개발자 가이드</span></a><div class="docs-header-links"><a href="/docs/">가이드 홈</a><a class="docs-demo-link" href="/demo">데모 체험</a></div></header>
<div class="layout"><nav class="docs-outline" aria-label="전체 가이드와 문서 목차">${nav}</nav><main id="main-content" tabindex="-1"><div class="guide-intro"><nav class="guide-breadcrumb" aria-label="현재 문서 위치"><a href="/docs/#install">환경 선택</a><span aria-hidden="true"> / </span><span>${category}</span><span aria-hidden="true"> / </span><span>${escapeHtml(guide.label)}</span></nav><div class="guide-tools"><a href="${download}" download>원문 .txt 다운로드</a><a href="${repository}docs/${guide.source}">저장소 원문 보기 ↗</a></div></div><article class="guide-content">${result.html}</article><footer><p>WebGuard · 비밀값과 권한 검증은 서버에서 관리하세요.</p><a href="/docs/#install">환경 선택으로 돌아가기 →</a></footer></main></div></body></html>\n`;
}

/** Generate only public presentation files; package-local Markdown copies stay untouched. */
export async function generatePublicGuides({
  output = join(root, "apps/docs/public"),
} = {}) {
  const pages = [];
  for (const guide of publicGuides) {
    const markdown = await readFile(join(root, "docs", guide.source), "utf8");
    const result = renderGuideMarkdown(markdown, guide.source);
    // Fail the build rather than silently publishing a link to a nonexistent repository path.
    for (const link of result.links) {
      if (!link.startsWith(repository)) continue;
      const relative = link
        .slice(repository.length)
        .split("#")[0]
        .split("/")
        .map(decodeURIComponent)
        .join("/");
      if (!(await stat(join(root, relative))).isFile())
        throw new Error(`Guide link is not a file: ${relative}`);
    }
    pages.push({
      guide,
      markdown,
      html: await format(guidePage(guide, result), { parser: "html" }),
    });
  }
  await mkdir(output, { recursive: true });
  for (const { guide, markdown, html } of pages) {
    await writeFile(join(output, guide.source.replace(/\.md$/, ".html")), html);
    await writeFile(
      join(output, guide.source.replace(/\.md$/, ".txt")),
      markdown,
    );
  }
  await copyFile(
    join(root, "apps/docs/src/style.css"),
    join(output, "guide.css"),
  );
}
