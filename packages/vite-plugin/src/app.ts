import { lstat } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { WebGuard, type WebGuardOptions } from "@webguard/browser";
import {
  createSecurityHeaders,
  resolveConfig,
  type SecurityHeadersOptions,
  type WebGuardConfigInput,
} from "@webguard/core";
import { webguard } from "./index.js";

export interface WebGuardAppOptions extends WebGuardConfigInput {
  /** Build-time serializable SDK settings. Shortcuts/context menus require explicit opt-in. */
  runtime?: Omit<WebGuardOptions, "preset" | "onThreat"> | false;
  /** Emit deployment header files; the host must apply them. Defaults to enforced Trusted Types. */
  headers?: SecurityHeadersOptions | false;
}
const bootstrapUrl = "/@webguard/auto-start";
const bootstrapId = "\0webguard:auto-start";
const headerFiles = ["webguard-headers.json", "_headers"];

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
  const { runtime, headers, ...buildOptions } = input;
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
  const bootstrap: Plugin = {
    name: "webguard-app-bootstrap",
    apply: "build",
    enforce: "pre",
    async configResolved(config) {
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
  return [bootstrap, webguard(policy)];
}
