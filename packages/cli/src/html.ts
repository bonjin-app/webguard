import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { hashContent } from "@webguard/integrity";
import { stripSourceMapReferences } from "@webguard/obfuscator";
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
