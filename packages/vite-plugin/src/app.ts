import { lstat } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { createDomIdentifierGenerator } from "@webguard/cli";
import {
  parse,
  serialize,
  defaultTreeAdapter,
  html as htmlNamespaces,
  type DefaultTreeAdapterMap,
} from "parse5";
import { protectedPreview } from "./preview.js";
import { trustedTypesCompatibility } from "./compatibility.js";
import { WebGuard, type WebGuardOptions } from "@webguard/browser";
import {
  createSecurityHeaders,
  resolveConfig,
  type SecurityHeadersOptions,
  type WebGuardConfigInput,
} from "@webguard/core";
import { webguard } from "./index.js";

export interface WebGuardAppOptions extends WebGuardConfigInput {
  /** Opaque CSS Modules class names only; global CSS and DOM IDs are unchanged. */
  domIdentifiers?: boolean;
  /** Build-time serializable SDK settings. Shortcuts/context menus require explicit opt-in. */
  runtime?: Omit<WebGuardOptions, "preset" | "onThreat"> | false;
  /** Inject early HTML CSP and emit deployment headers; HTTP-only directives still require the host. */
  headers?: SecurityHeadersOptions | false;
}
const bootstrapUrl = "/@webguard/auto-start";
const bootstrapId = "\0webguard:auto-start";
const headerFiles = ["webguard-headers.json", "_headers"];

/** Insert policy after HTML hooks have finished, before any browser resource can be loaded. */
function addMetaPolicy(
  source: string,
  enforcement: string,
  filename: string,
): string {
  const document = parse(source);
  let head: DefaultTreeAdapterMap["element"] | undefined;
  const encodings: DefaultTreeAdapterMap["element"][] = [];
  const visit = (node: DefaultTreeAdapterMap["node"]): void => {
    if ("tagName" in node && node.namespaceURI === htmlNamespaces.NS.HTML) {
      if (node.tagName === "head") head = node;
      if (node.tagName === "meta") {
        const equivalent = node.attrs
          .find((attribute) => attribute.name === "http-equiv")
          ?.value.trim()
          .toLowerCase();
        const charset = node.attrs.find(
          (attribute) => attribute.name === "charset",
        );
        if (charset || equivalent === "content-type") {
          const content = node.attrs.find(
            (attribute) => attribute.name === "content",
          )?.value;
          // Vite emits UTF-8 bytes; accepting another encoding would misdecode the document.
          const encoding =
            charset?.value ??
            content
              ?.match(
                /^text\/html\s*;\s*charset\s*=\s*(?:"(utf-8)"|'(utf-8)'|(utf-8))\s*;?\s*$/i,
              )
              ?.slice(1)
              .find(Boolean);
          if (encoding?.trim().toLowerCase() !== "utf-8")
            throw new Error(
              `Invalid or conflicting charset in ${filename}; Vite HTML must declare UTF-8`,
            );
          encodings.push(node);
        }
        if (
          equivalent === "content-security-policy" ||
          equivalent === "content-security-policy-report-only"
        )
          throw new Error(
            `Existing CSP meta in ${filename}; use headers:false to manage the document policy explicitly`,
          );
      }
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
    // Template contents are inert and must not become document policy/encoding declarations.
  };
  visit(document);
  if (!head) throw new Error(`Unable to place CSP meta in ${filename}`);
  // frame-ancestors is ignored in meta. Keep it in the emitted HTTP policy only.
  const content = enforcement
    .split(";")
    .map((directive) => directive.trim())
    .filter(
      (directive) =>
        directive &&
        directive.split(/\s+/)[0]?.toLowerCase() !== "frame-ancestors",
    )
    .join("; ");
  const meta = defaultTreeAdapter.createElement(
    "meta",
    htmlNamespaces.NS.HTML,
    [
      { name: "http-equiv", value: "Content-Security-Policy" },
      { name: "content", value: content },
    ],
  );
  // Keep the encoding declaration within the first 1024 bytes even for large policies.
  // Normalize compatible duplicates and late declarations without moving resource tags ahead of CSP.
  for (const encoding of encodings) defaultTreeAdapter.detachNode(encoding);
  const charset = defaultTreeAdapter.createElement(
    "meta",
    htmlNamespaces.NS.HTML,
    [{ name: "charset", value: "utf-8" }],
  );
  charset.parentNode = head;
  meta.parentNode = head;
  head.childNodes.unshift(charset, meta);
  return serialize(document);
}

/** One build configuration: Strict protection, automatic SDK startup and deployment header artifacts.
 * Legacy webguard() remains build-only; this opt-in convenience entry point adds the runtime.
 */
export function webguardApp(input: WebGuardAppOptions = {}): Plugin[] {
  return createWebGuardApp(input, () =>
    fileURLToPath(import.meta.resolve("@webguard/browser")),
  );
}

/** Internal facade adapter; the public API does not expose a runtime resolver. */
export function createWebGuardApp(
  input: WebGuardAppOptions,
  resolveRuntime: () => string,
): Plugin[] {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("WebGuard app options must be an object");
  const { runtime, headers, domIdentifiers, ...buildOptions } = input;
  if (domIdentifiers !== undefined && typeof domIdentifiers !== "boolean")
    throw new TypeError("domIdentifiers must be a boolean");
  const policy = resolveConfig({
    ...buildOptions,
    preset: buildOptions.preset === undefined ? "strict" : buildOptions.preset,
  });
  let runtimeOptions: WebGuardOptions | false = false;
  if (runtime !== false) {
    if (
      runtime !== undefined &&
      (!runtime || typeof runtime !== "object" || Array.isArray(runtime))
    )
      throw new TypeError("runtime must be an object or false");
    if (runtime && ("onThreat" in runtime || "preset" in runtime))
      throw new TypeError(
        "runtime must be serializable; attach onThreat through the client update API",
      );
    // Validate before merging defaults so malformed nested input cannot be hidden by object spread.
    const guard = WebGuard.init(runtime ?? {});
    const validated = guard.getOptions();
    guard.destroy();
    runtimeOptions = {
      ...validated,
      preset: policy.preset,
      devtools: { detect: true, ...validated.devtools },
    };
  }
  const responseHeaders =
    headers === false ? false : createSecurityHeaders(headers);
  let domNameGenerator:
    ReturnType<typeof createDomIdentifierGenerator> | undefined;
  const bootstrap: Plugin = {
    name: "webguard-app-bootstrap",
    apply: "build",
    enforce: "pre",
    config(config) {
      if (!domIdentifiers) return;
      if (config.css?.transformer === "lightningcss")
        throw new Error(
          "WebGuard domIdentifiers requires Vite's PostCSS CSS Modules pipeline; disable lightningcss or configure opaque module naming in your compiler",
        );
      if (
        config.css?.modules === false ||
        (config.css?.modules &&
          config.css.modules.generateScopedName !== undefined)
      )
        throw new Error(
          "WebGuard domIdentifiers conflicts with css.modules:false or an existing generateScopedName; remove the conflict or use createDomIdentifierGenerator explicitly for both SSR and browser builds",
        );
      domNameGenerator = createDomIdentifierGenerator({
        root: resolve(config.root ?? process.cwd()),
      });
      return {
        css: {
          modules: {
            generateScopedName: domNameGenerator,
          },
        },
      };
    },
    async configResolved(config) {
      if (
        domIdentifiers &&
        (config.css?.transformer === "lightningcss" ||
          config.css?.modules === false ||
          config.css?.modules?.generateScopedName !== domNameGenerator)
      )
        throw new Error(
          "WebGuard domIdentifiers configuration was replaced by another plugin; configure createDomIdentifierGenerator explicitly in both server and browser compilers",
        );
      if (!responseHeaders) return;
      const directories: string[] = config.publicDir ? [config.publicDir] : [];
      const output = resolve(config.root, config.build.outDir);
      const location = relative(config.root, output);
      const nested =
        location !== "" &&
        location !== ".." &&
        !location.startsWith(`..${sep}`) &&
        !isAbsolute(location);
      const retained =
        config.build.emptyOutDir === false ||
        (config.build.emptyOutDir !== true && !nested);
      if (retained) directories.push(output);
      for (const directory of directories) {
        for (const name of headerFiles) {
          try {
            await lstat(join(directory, name));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
            throw error;
          }
          throw new Error(
            `WebGuard refuses to replace existing ${name}; use headers:false and integrate your policy explicitly`,
          );
        }
      }
    },
    resolveId(id) {
      if (id === bootstrapUrl) return bootstrapId;
    },
    load(id) {
      if (id !== bootstrapId || runtimeOptions === false) return;
      const runtimePath = resolveRuntime();
      return `import { installAutoGuard } from ${JSON.stringify(runtimePath)};\ninstallAutoGuard(${JSON.stringify(runtimeOptions)});`;
    },
    transformIndexHtml: {
      order: "pre",
      handler() {
        if (runtimeOptions === false) return;
        return [
          {
            tag: "script",
            attrs: { type: "module", src: bootstrapUrl },
            injectTo: "head-prepend",
          },
        ];
      },
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        if (!responseHeaders) return;
        for (const name of headerFiles)
          if (Object.hasOwn(bundle, name))
            throw new Error(
              `WebGuard refuses to replace existing output ${name}`,
            );
        for (const asset of Object.values(bundle)) {
          if (
            asset.type !== "asset" ||
            !asset.fileName.toLowerCase().endsWith(".html")
          )
            continue;
          const html =
            typeof asset.source === "string"
              ? asset.source
              : Buffer.from(asset.source).toString("utf8");
          asset.source = addMetaPolicy(
            html,
            responseHeaders["Content-Security-Policy"]!,
            asset.fileName,
          );
        }
        this.emitFile({
          type: "asset",
          fileName: "webguard-headers.json",
          source: JSON.stringify(responseHeaders, null, 2) + "\n",
        });
        this.emitFile({
          type: "asset",
          fileName: "_headers",
          source:
            "/*\n" +
            Object.entries(responseHeaders)
              .map(([key, value]) => `  ${key}: ${value}`)
              .join("\n") +
            "\n",
        });
      },
    },
  };
  return [
    bootstrap,
    trustedTypesCompatibility(
      responseHeaders !== false &&
        Boolean(
          responseHeaders["Content-Security-Policy"]?.includes(
            "require-trusted-types-for 'script'",
          ),
        ),
    ),
    webguard(policy, responseHeaders || undefined),
    protectedPreview(responseHeaders),
  ];
}
