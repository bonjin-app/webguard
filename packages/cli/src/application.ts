import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parse,
  serialize,
  defaultTreeAdapter,
  html,
  type DefaultTreeAdapterMap,
} from "parse5";
import { WebGuard, type WebGuardOptions } from "@webguard/browser";
import {
  createSecurityHeaders,
  resolveConfig,
  type SecurityHeadersOptions,
} from "@webguard/core";
import {
  protectDirectory,
  type ProtectOptions,
  type ProtectionReport,
} from "./pipeline.js";
import {
  assertAbsent,
  canonicalPath,
  listFiles,
  overlaps,
} from "./fs-utils.js";
import { scanDirectory } from "./scan.js";

export interface ProtectAppOptions extends Omit<
  ProtectOptions,
  "alreadyTransformed"
> {
  /** Serializable SDK settings; keyboard/context restrictions remain explicit opt-ins. */
  runtime?: Omit<WebGuardOptions, "preset" | "onThreat"> | false;
  /** False preserves a separately managed deployment policy instead of emitting one. */
  headers?: SecurityHeadersOptions | false;
}
const runtimePath = "assets/webguard-runtime.js";
const headerFiles = ["_headers", "webguard-headers.json"];
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
function walk(
  node: Node,
  visit: (node: Node) => void,
  templates = false,
): void {
  visit(node);
  if ("childNodes" in node)
    for (const child of node.childNodes) walk(child, visit, templates);
  if (templates && "content" in node)
    walk(node.content as Node, visit, templates);
}
function attribute(node: Element, name: string): string | undefined {
  return node.attrs.find((item) => item.name === name)?.value;
}
function optionsObject(value: ProtectAppOptions): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Application protection options must be an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(
      "Application protection options must be a plain object",
    );
  for (const key of Reflect.ownKeys(value)) {
    if (
      typeof key !== "string" ||
      ![
        "output",
        "privateArtifactsDir",
        "config",
        "publicBase",
        "runtime",
        "headers",
      ].includes(key)
    )
      throw new TypeError("Unknown application protection option");
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError(
        "Application protection options cannot contain accessors",
      );
  }
}
function deploymentBase(value: string | undefined): URL {
  if (
    value !== undefined &&
    (typeof value !== "string" || !value.trim() || value !== value.trim())
  )
    throw new TypeError("publicBase must be a deployment URL path");
  const url = new URL(value ?? "/", "https://webguard.invalid/");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new TypeError(
      "publicBase must be an HTTP(S) deployment path without credentials, query or fragment",
    );
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}
/** Parse real static HTML only. Server templates must load the emitted asset manually. */
function prepareHtml(
  source: string,
  filename: string,
  enforcement: string | false,
  runtimeUrl: string | false,
): string {
  if (enforcement && /<%|<\?(?:php|=)/i.test(source))
    throw new Error(
      `Unsupported server template in ${filename}; render static HTML before protection`,
    );
  const document = parse(source);
  let head: Element | undefined;
  const encodings: Element[] = [],
    existingPolicies: Element[] = [];
  walk(document, (node) => {
    if (!("tagName" in node)) return;
    if (node.tagName === "head" && node.namespaceURI === html.NS.HTML)
      head = node;
    if (node.tagName === "base" && (enforcement || runtimeUrl))
      throw new Error(
        `Existing base element in ${filename}; remove it or use runtime:false and headers:false, then load the SDK explicitly`,
      );
    if (node.tagName !== "meta" || node.namespaceURI !== html.NS.HTML) return;
    const equivalent = attribute(node, "http-equiv")?.trim().toLowerCase();
    if (
      equivalent === "content-security-policy" ||
      equivalent === "content-security-policy-report-only"
    ) {
      if (enforcement)
        throw new Error(
          `Existing CSP meta in ${filename}; use headers:false and manage the policy explicitly`,
        );
      existingPolicies.push(node);
    }
    if (!enforcement) return;
    const charset = node.attrs.find((item) => item.name === "charset");
    if (charset || equivalent === "content-type") {
      const encoding =
        charset?.value ??
        attribute(node, "content")
          ?.match(
            /^text\/html\s*;\s*charset\s*=\s*(?:"(utf-8)"|'(utf-8)'|(utf-8))\s*;?\s*$/i,
          )
          ?.slice(1)
          .find(Boolean);
      if (encoding?.trim().toLowerCase() !== "utf-8")
        throw new Error(
          `Invalid or conflicting charset in ${filename}; static HTML must declare UTF-8`,
        );
      encodings.push(node);
    }
  });
  if (!head) throw new Error(`Unable to locate the HTML head in ${filename}`);
  if (enforcement) {
    walk(
      document,
      (node) => {
        if (!("tagName" in node)) return;
        const incompatible = (kind: string): never => {
          throw new Error(
            `${kind} in ${filename} would be blocked by the automatic CSP; externalize it or use headers:false with an explicitly managed compatible policy`,
          );
        };
        if (
          node.tagName === "script" &&
          !node.attrs.some((item) => item.name === "src")
        ) {
          const type = (attribute(node, "type") ?? "")
            .trim()
            .toLowerCase()
            .split(";")[0]!
            .trim();
          const dataOnly =
            type &&
            type !== "module" &&
            type !== "importmap" &&
            type !== "speculationrules" &&
            !/^(?:application|text)\/(?:x-)?(?:java|ecma)script(?:1\.[0-5])?$|^text\/(?:jscript|livescript)$/.test(
              type,
            );
          const code = node.childNodes.some(
            (child) => "value" in child && child.value.trim(),
          );
          // Static classic/module bodies are transformed and hash-authorized in the
          // final staged HTML pass. Non-JavaScript policy blocks need their own handling.
          if (!dataOnly && code && type === "speculationrules")
            incompatible(`Unsupported inline script ${type}`);
        }
        if (
          node.tagName === "style" &&
          node.childNodes.some(
            (child) => "value" in child && child.value.trim(),
          )
        )
          incompatible("Inline style");
        for (const item of node.attrs) {
          if (/^on/i.test(item.name)) incompatible("Inline event handler");
          if (item.name === "style" && item.value.trim())
            incompatible("Inline style attribute");
          if (
            /^(?:href|src|action|formaction|data)$/i.test(item.name) &&
            /^javascript:/i.test(
              Array.from(item.value)
                .filter((character) => character.charCodeAt(0) > 32)
                .join(""),
            )
          )
            incompatible("javascript URL");
        }
      },
      true,
    );
    for (const encoding of encodings) defaultTreeAdapter.detachNode(encoding);
    const charset = defaultTreeAdapter.createElement("meta", html.NS.HTML, [
      { name: "charset", value: "utf-8" },
    ]);
    const policy = defaultTreeAdapter.createElement("meta", html.NS.HTML, [
      { name: "http-equiv", value: "Content-Security-Policy" },
      {
        name: "content",
        value: enforcement
          .split(";")
          .map((item) => item.trim())
          .filter(
            (item) =>
              item && item.split(/\s+/)[0]?.toLowerCase() !== "frame-ancestors",
          )
          .join("; "),
      },
    ]);
    charset.parentNode = head;
    policy.parentNode = head;
    head.childNodes.unshift(charset, policy);
  }
  if (runtimeUrl) {
    // Keep a separately managed CSP effective for the runtime too, rather than
    // inserting a script before its policy and accidentally bypassing that policy.
    let position = enforcement ? 2 : 0;
    if (!enforcement && existingPolicies.length) {
      for (const policy of existingPolicies) {
        if (policy.parentNode !== head)
          throw new Error(
            `Existing CSP placement in ${filename} prevents early SDK startup; manage the runtime explicitly with runtime:false`,
          );
        position = Math.max(position, head.childNodes.indexOf(policy) + 1);
      }
      if (
        head.childNodes
          .slice(0, position)
          .some((node) => "tagName" in node && node.tagName === "script")
      )
        throw new Error(
          `Existing CSP follows app scripts in ${filename}; move the policy before scripts or manage SDK startup with runtime:false`,
        );
    }
    const script = defaultTreeAdapter.createElement("script", html.NS.HTML, [
      { name: "src", value: runtimeUrl },
    ]);
    script.parentNode = head;
    head.childNodes.splice(position, 0, script);
  }
  return serialize(document);
}

/** Internal facade adapter. The resolver returns trusted standalone SDK source code. */
export function createApplicationProtector(
  resolveRuntime: () => Promise<string>,
): (input: string, options?: ProtectAppOptions) => Promise<ProtectionReport> {
  return async (input, options = {}) => {
    optionsObject(options);
    resolveConfig(options.config); // Validate before merging so null/invalid inputs cannot be hidden.
    const policy = resolveConfig({
      ...options.config,
      preset:
        options.config?.preset === undefined ? "strict" : options.config.preset,
    });
    const responseHeaders =
      options.headers === false
        ? false
        : createSecurityHeaders(options.headers);
    const base = deploymentBase(options.publicBase);
    let runtimeOptions: WebGuardOptions | false = false;
    if (options.runtime !== false) {
      if (
        options.runtime &&
        ("preset" in options.runtime || "onThreat" in options.runtime)
      )
        throw new TypeError(
          "runtime must be serializable without preset/onThreat; attach callbacks through the client update API",
        );
      const guard = WebGuard.init(
        options.runtime === undefined ? {} : options.runtime,
      );
      const validated = guard.getOptions();
      guard.destroy();
      runtimeOptions = {
        ...validated,
        preset: policy.preset,
        devtools: { detect: true, ...validated.devtools },
      };
    }
    const inputPath = resolve(input),
      source = await canonicalPath(inputPath);
    const outputPath = resolve(options.output ?? `${inputPath}-protected`),
      output = await canonicalPath(outputPath);
    const privatePath = resolve(
        options.privateArtifactsDir ?? `${outputPath}.private-maps`,
      ),
      privateDir = await canonicalPath(privatePath);
    if (overlaps(source, output) || overlaps(output, source))
      throw new Error(
        "Input and output directories must not overlap or be inside each other",
      );
    if (
      (policy.sourceMaps.privateArtifacts ||
        options.privateArtifactsDir !== undefined) &&
      [source, output].some(
        (path) => overlaps(path, privateDir) || overlaps(privateDir, path),
      )
    )
      throw new Error(
        "Private artifacts must not overlap input or be inside public output",
      );
    await assertAbsent(outputPath);
    if (policy.sourceMaps.privateArtifacts) await assertAbsent(privatePath);
    await listFiles(inputPath); // Reject a symlink root before canonicalizing the clone.
    const paths = await listFiles(source);
    const reserved = [
      "webguard-manifest.json",
      "webguard-report.json",
      ...(runtimeOptions !== false ? [runtimePath] : []),
      ...(responseHeaders ? headerFiles : []),
    ];
    for (const path of reserved)
      if (paths.includes(path))
        throw new Error(
          `Input contains existing reserved ${path}; use an unprotected build or explicitly manage runtime/headers`,
        );
    const secrets = (await scanDirectory(source)).filter(
      (finding) => finding.category === "potential-secret",
    );
    if (secrets.length)
      throw new Error(
        `Potential credentials detected in source deployment files: ${secrets.map((finding) => finding.path).join(", ")}. Remove secrets before protecting.`,
      );
    const htmlFiles = new Map<string, string>();
    for (const path of paths)
      if (/\.html?$/i.test(path))
        htmlFiles.set(
          path,
          prepareHtml(
            await readFile(join(source, path), "utf8"),
            path,
            responseHeaders
              ? responseHeaders["Content-Security-Policy"]!
              : false,
            runtimeOptions === false
              ? false
              : new URL(runtimePath, base).pathname,
          ),
        );
    const runtimeSource =
      runtimeOptions === false ? false : await resolveRuntime();
    if (
      runtimeSource !== false &&
      (typeof runtimeSource !== "string" || !runtimeSource.trim())
    )
      throw new Error(
        "Standalone browser SDK is missing or empty; build the browser package before protecting an application",
      );
    await mkdir(dirname(outputPath), { recursive: true });
    const clone = await mkdtemp(join(dirname(outputPath), ".webguard-app-"));
    try {
      for (const path of paths) {
        const destination = join(clone, path);
        await mkdir(dirname(destination), { recursive: true });
        const htmlSource = htmlFiles.get(path);
        if (htmlSource !== undefined)
          await writeFile(destination, htmlSource, { flag: "wx" });
        else await copyFile(join(source, path), destination);
      }
      if (runtimeSource !== false) {
        await mkdir(dirname(join(clone, runtimePath)), { recursive: true });
        await writeFile(
          join(clone, runtimePath),
          `${runtimeSource}\n;WebGuardSDK.installAutoGuard(${JSON.stringify(runtimeOptions)});\n`,
          { flag: "wx" },
        );
      }
      if (responseHeaders) {
        await writeFile(
          join(clone, "webguard-headers.json"),
          JSON.stringify(responseHeaders, null, 2) + "\n",
          { flag: "wx" },
        );
        await writeFile(
          join(clone, "_headers"),
          "/*\n" +
            Object.entries(responseHeaders)
              .map(([key, value]) => `  ${key}: ${value}`)
              .join("\n") +
            "\n",
          { flag: "wx" },
        );
      }
      return await protectDirectory(
        clone,
        {
          ...options,
          config: policy,
          output: outputPath,
          ...(policy.sourceMaps.privateArtifacts || options.privateArtifactsDir
            ? { privateArtifactsDir: privatePath }
            : {}),
        },
        responseHeaders ? { ownedHeaders: responseHeaders } : {},
      );
    } finally {
      await rm(clone, { recursive: true, force: true });
    }
  };
}

/** Protect arbitrary static build output with automatic early SDK startup. */
export async function protectAppDirectory(
  input: string,
  options: ProtectAppOptions = {},
): Promise<ProtectionReport> {
  return createApplicationProtector(async () =>
    readFile(
      join(
        dirname(fileURLToPath(import.meta.resolve("@webguard/browser"))),
        "webguard.global.js",
      ),
      "utf8",
    ),
  )(input, options);
}
