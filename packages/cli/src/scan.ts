import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { listFiles } from "./fs-utils.js";
export interface Finding {
  path: string;
  category:
    | "source-map"
    | "original-source"
    | "mapping-reference"
    | "debug-info"
    | "potential-secret"
    | "security-policy"
    | "integrity-policy";
  severity: "warning" | "error";
  message: string;
}
export function hasPotentialCredential(content: string, path = ""): boolean {
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk_live_[A-Za-z0-9]{16,}|(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"'\s]{12,}["']/i.test(
      content,
    ) || /(^|\/)\.env(?:\.|$)/.test(path)
  );
}
const textExtension =
  /\.(?:[cm]?js|css|html?|json|txt|ts|tsx|jsx|vue|svelte|env)$/i;
export async function scanDirectory(directory: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const path of await listFiles(directory)) {
    const add = (
      category: Finding["category"],
      severity: Finding["severity"],
      message: string,
    ) => findings.push({ path, category, severity, message });
    if (/\.map$/i.test(path))
      add("source-map", "error", "Public source map file");
    if (/\.(?:tsx?|jsx|vue|svelte)$/i.test(path) && !/\.d\.ts$/i.test(path))
      add("original-source", "error", "Original development source file");
    if (!textExtension.test(path) && !/(^|\/)\.env(?:\.|$)/.test(path))
      continue;
    const content = await readFile(join(directory, path), "utf8");
    if (/\.html?$/i.test(path)) {
      let csp = false;
      function inspect(node: DefaultTreeAdapterMap["node"]) {
        if ("tagName" in node) {
          const attr = (name: string) =>
            node.attrs.find((a) => a.name === name)?.value;
          if (
            node.tagName === "meta" &&
            attr("http-equiv")?.toLowerCase() === "content-security-policy"
          ) {
            csp = true;
            const policy = attr("content") ?? "";
            if (/['"]unsafe-(?:eval|inline)['"]/.test(policy))
              add(
                "security-policy",
                "warning",
                "HTML CSP permits inline scripts or eval; review the actual HTTP policy and application needs",
              );
          }
          if (
            (node.tagName === "script" && attr("src")) ||
            (node.tagName === "link" &&
              /(?:^|\s)(?:stylesheet|modulepreload)(?:\s|$)/i.test(
                attr("rel") ?? "",
              ))
          ) {
            if (
              !/\bsha(?:256|384|512)-[A-Za-z0-9+/]+=*/.test(
                attr("integrity") ?? "",
              )
            )
              add(
                "integrity-policy",
                "warning",
                "External script/style has no recognizable SRI digest",
              );
          }
        }
        if ("childNodes" in node)
          for (const child of node.childNodes) inspect(child);
      }
      inspect(parse(content));
      if (!csp)
        add(
          "security-policy",
          "warning",
          "CSP cannot be confirmed from static HTML; inspect the deployed HTTP Content-Security-Policy header",
        );
    }
    if (/(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=/.test(content))
      add(
        "mapping-reference",
        "warning",
        "Potential source map reference (including possible string literal; review context)",
      );
    if (/\b(?:console\.(?:log|debug|trace)\s*\(|debugger\s*;)/.test(content))
      add(
        "debug-info",
        "warning",
        "Potential debugging statement; may be intentional",
      );
    if (hasPotentialCredential(content, path))
      add(
        "potential-secret",
        "error",
        "Potential credential or private configuration; value redacted",
      );
  }
  return findings;
}
