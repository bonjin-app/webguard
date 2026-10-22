import {
  parse,
  serialize,
  html as namespaces,
  type DefaultTreeAdapterMap,
} from "parse5";
import { createHash } from "node:crypto";
import type { ObfuscationConfig } from "@webguard/core";
import { hashContent } from "@webguard/integrity";
import {
  assertStaticScript,
  obfuscate,
  stripSourceMapReferences,
} from "@webguard/obfuscator";
import { stripCssSourceMaps } from "./fs-utils.js";
type Node = DefaultTreeAdapterMap["node"];
function walk(node: Node, fn: (node: Node) => void, templates = true) {
  fn(node);
  if ("childNodes" in node)
    for (const child of node.childNodes) walk(child, fn, templates);
  if (templates && "content" in node) walk(node.content as Node, fn, templates);
}
const jsMimes = new Set([
  "module",
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);
type Element = DefaultTreeAdapterMap["element"];
const attribute = (node: Element, name: string) =>
  node.attrs.find((item) => item.name === name)?.value;
const scriptText = (node: Element) =>
  node.childNodes
    .map((child) => ("value" in child ? child.value : ""))
    .join("");
function scriptKind(
  node: Element,
): "classic" | "module" | "importmap" | "speculationrules" | "data" {
  const type = (attribute(node, "type") ?? "").trim().toLowerCase();
  if (type === "module" || type === "importmap" || type === "speculationrules")
    return type;
  return !type || jsMimes.has(type.split(";")[0]!) ? "classic" : "data";
}
export interface InlineScriptRecord {
  path: string;
  index: number;
  kind: string;
  inert: boolean;
  transformed: boolean;
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
}
/** Transform actual script elements only; never interpret arbitrary strings as nested programs. */
export async function protectInlineScripts(
  source: string,
  filename: string,
  policy: ObfuscationConfig,
  selected: (path: string) => boolean,
  ownedPolicy: boolean,
  sourceMap: boolean,
  unmanagedHeaders = false,
): Promise<{
  html: string;
  records: InlineScriptRecord[];
  maps: { path: string; source: string }[];
}> {
  if (policy.enabled && /<%|<\?(?:php|=)/i.test(source))
    throw new Error(
      `Unsupported server template in ${filename}; render static HTML before protection`,
    );
  const document = parse(sanitizeInlineSources(source));
  const scripts: { node: Element; inert: boolean }[] = [];
  let unmanaged = false;
  const collect = (node: Node, inert = false): void => {
    if ("tagName" in node) {
      if (ownedPolicy) {
        for (const item of node.attrs) {
          if (/^on/i.test(item.name))
            throw new Error(
              `Unsupported inline event handler in ${filename}; use a JavaScript listener`,
            );
          if (
            /^(?:href|src|action|formaction|data)$/i.test(item.name) &&
            /^javascript:/i.test(
              Array.from(item.value)
                .filter((character) => character.charCodeAt(0) > 32)
                .join(""),
            )
          )
            throw new Error(`Unsupported javascript URL in ${filename}`);
        }
      }
      if (
        !inert &&
        node.tagName === "meta" &&
        /^content-security-policy(?:-report-only)?$/i.test(
          attribute(node, "http-equiv")?.trim() ?? "",
        )
      )
        unmanaged = true;
      if (
        node.tagName === "script" &&
        !node.attrs.some((item) => item.name === "src")
      )
        scripts.push({ node, inert });
    }
    if ("childNodes" in node)
      for (const child of node.childNodes) collect(child, inert);
    if ("content" in node) collect(node.content as Node, true);
  };
  collect(document);
  const records: InlineScriptRecord[] = [],
    maps: { path: string; source: string }[] = [];
  for (const [index, { node, inert }] of scripts.entries()) {
    const kind = scriptKind(node),
      original = scriptText(node);
    if (ownedPolicy && original.trim() && kind === "speculationrules")
      throw new Error(
        `Unsupported inline script ${kind} in ${filename}; manage this policy explicitly`,
      );
    const virtualPath = `${filename}.inline-${index + 1}.js`;
    let code = original,
      transformed = false,
      durationMs = 0;
    if (
      (kind === "classic" || kind === "module") &&
      original.trim() &&
      policy.enabled &&
      selected(virtualPath)
    ) {
      if (node.namespaceURI !== namespaces.NS.HTML)
        throw new Error(`Unsupported foreign script context in ${filename}`);
      if ((unmanaged || unmanagedHeaders) && !ownedPolicy)
        throw new Error(
          `Unmanaged CSP in ${filename}; inline transformation requires automatically owned headers or a build without an existing policy`,
        );
      assertStaticScript(original, kind, virtualPath);
      const {
        enabled: _enabled,
        include: _include,
        exclude: _exclude,
        ...settings
      } = policy;
      const result = await obfuscate(original, {
        ...settings,
        identifiersPrefix: `_wg_${createHash("sha256").update(virtualPath).digest("hex").slice(0, 16)}_`,
        inputFileName: virtualPath,
        sourceMap,
      });
      code = result.code;
      if (/<!--|<\/script(?=[\t\n\f\r />])/i.test(code))
        throw new Error(
          `Unsupported HTML raw-text delimiter in transformed ${virtualPath}; externalize this block`,
        );
      durationMs = result.durationMs;
      transformed = true;
      for (const child of node.childNodes)
        if ("value" in child) child.value = "";
      const text = node.childNodes.find((child) => "value" in child);
      if (text && "value" in text) text.value = code;
      if (result.map)
        maps.push({ path: `${virtualPath}.map`, source: result.map });
    }
    records.push({
      path: filename,
      index: index + 1,
      kind,
      inert,
      transformed,
      inputBytes: Buffer.byteLength(original),
      outputBytes: Buffer.byteLength(code),
      durationMs,
    });
  }
  return { html: serialize(document), records, maps };
}

const metaPolicy = (policy: string) =>
  policy
    .split(";")
    .map((item) => item.trim())
    .filter(
      (item) =>
        item && item.split(/\s+/)[0]?.toLowerCase() !== "frame-ancestors",
    )
    .join("; ");
/** Hash parsed final script text, including whitespace, never the pre-transform source. */
export function inlineScriptHashes(source: string): string[] {
  const hashes = new Set<string>();
  walk(parse(source), (node) => {
    if (
      !("tagName" in node) ||
      node.tagName !== "script" ||
      node.attrs.some((item) => item.name === "src")
    )
      return;
    const kind = scriptKind(node);
    if (
      ["classic", "module", "importmap"].includes(kind) &&
      scriptText(node).trim()
    )
      hashes.add(hashContent(scriptText(node)));
    if (kind === "speculationrules" && scriptText(node).trim())
      throw new Error(
        "Unsupported speculationrules under automatic CSP; manage this policy explicitly",
      );
  });
  return [...hashes];
}
export function addInlineScriptHashes(
  headers: Record<string, string>,
  hashes: string[],
): Record<string, string> {
  const result = { ...headers };
  if (!hashes.length) return result;
  for (const name of [
    "Content-Security-Policy",
    "Content-Security-Policy-Report-Only",
  ]) {
    if (!result[name]) continue;
    result[name] = result[name]!.split(";")
      .map((directive) =>
        /^\s*script-src\s/.test(directive)
          ? `${directive} ${hashes.map((hash) => `'${hash}'`).join(" ")}`
          : directive,
      )
      .join(";");
    if (Buffer.byteLength(result[name]!) > 16384)
      throw new Error(
        "Automatic inline CSP exceeds the 16 KiB policy budget; externalize script blocks",
      );
  }
  return result;
}
export function synchronizeOwnedPolicy(
  source: string,
  previous: string,
  next: string,
  filename: string,
): string {
  const document = parse(source);
  let policies = 0;
  walk(
    document,
    (node) => {
      if (!("tagName" in node) || node.tagName !== "meta") return;
      const equivalent = attribute(node, "http-equiv")?.trim().toLowerCase();
      if (equivalent === "content-security-policy-report-only")
        throw new Error(`Unmanaged CSP report-only meta in ${filename}`);
      if (equivalent !== "content-security-policy") return;
      const content = node.attrs.find((item) => item.name === "content");
      if (!content || content.value !== metaPolicy(previous))
        throw new Error(
          `Unmanaged or changed CSP in ${filename}; automatic finalization refused`,
        );
      content.value = metaPolicy(next);
      policies++;
    },
    false,
  );
  if (policies !== 1)
    throw new Error(`Missing or duplicate owned CSP in ${filename}`);
  return serialize(document);
}
export function sanitizeInlineSources(html: string): string {
  const doc = parse(html);
  walk(doc, (node) => {
    if (!("tagName" in node)) return;
    const type =
      node.attrs
        .find((a) => a.name === "type")
        ?.value.trim()
        .toLowerCase() ?? "";
    const script =
      node.tagName === "script" &&
      !node.attrs.some((a) => a.name === "src") &&
      (!type || jsMimes.has(type.split(";")[0]!.trim()));
    if (!script && node.tagName !== "style") return;
    for (const child of node.childNodes)
      if ("value" in child && child.nodeName === "#text")
        child.value = script
          ? stripSourceMapReferences(child.value)
          : stripCssSourceMaps(child.value);
  });
  return serialize(doc);
}
/** Resolve URLs using browser base semantics and the deployment's public path. */
export function addSubresourceIntegrity(
  html: string,
  htmlPath: string,
  assets: Map<string, Uint8Array>,
  publicBase = "/",
): string {
  const doc = parse(html),
    deployment = new URL(publicBase, "https://webguard.invalid/");
  if (!deployment.pathname.endsWith("/")) deployment.pathname += "/";
  const documentUrl = new URL(htmlPath, deployment);
  let documentBase = documentUrl,
    found = false;
  walk(
    doc,
    (node) => {
      if (!found && "tagName" in node && node.tagName === "base") {
        const href = node.attrs.find((a) => a.name === "href");
        if (href) {
          documentBase = new URL(href.value, documentUrl);
          found = true;
        }
      }
    },
    false,
  );
  walk(doc, (node) => {
    if (!("tagName" in node)) return;
    const attr = (name: string) => node.attrs.find((a) => a.name === name);
    const source =
      node.tagName === "script"
        ? attr("src")
        : node.tagName === "link" &&
            (attr("rel")?.value ?? "")
              .toLowerCase()
              .split(/[\t\n\f\r ]+/)
              .some(
                (token) => token === "stylesheet" || token === "modulepreload",
              )
          ? attr("href")
          : undefined;
    if (!source) return;
    const url = new URL(source.value, documentBase);
    if (
      url.origin !== deployment.origin ||
      !url.pathname.startsWith(deployment.pathname)
    )
      return;
    const bytes = assets.get(
      decodeURIComponent(url.pathname.slice(deployment.pathname.length)),
    );
    if (bytes) {
      node.attrs = node.attrs.filter((a) => a.name !== "integrity");
      node.attrs.push({ name: "integrity", value: hashContent(bytes) });
      if (!attr("crossorigin"))
        node.attrs.push({ name: "crossorigin", value: "anonymous" });
    }
  });
  return serialize(doc);
}
