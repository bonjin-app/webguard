import { fileURLToPath } from "node:url";
import { WebGuard, type WebGuardOptions } from "@webguard/browser";
import { resolveConfig, type Preset } from "@webguard/core";
import JavaScriptObfuscator from "javascript-obfuscator";
import {
  createObfuscatorOptions,
  preserveLicenseComments,
  stripSourceMapReferences,
} from "@webguard/obfuscator";
import {
  chunkPreset,
  isPureFrameworkChunk,
  type ModuleOrigin,
} from "./next-classification";

export interface WebGuardNextOptions {
  preset?: Preset;
  /** Pure third-party module graphs use Standard at most by default; app/SDK/unknown chunks keep preset. */
  frameworkPreset?: "standard" | "inherit";
  /** Serializable browser policy. Callbacks belong in the browser client API. */
  runtime?: Omit<WebGuardOptions, "preset" | "onThreat"> | false;
}

interface WebpackConfig {
  entry?: unknown;
  plugins?: unknown[];
  devtool?: unknown;
  optimization?: Record<string, unknown>;
  [key: string]: unknown;
}
interface WebpackContext {
  dev: boolean;
  isServer: boolean;
  nextRuntime?: string;
}
interface Asset {
  name: string;
  source: { source(): string | Uint8Array };
  info?: {
    webguardProtected?: boolean;
    webguardTier?: {
      preset: Preset;
      origin: string;
      inputBytes: number;
      outputBytes: number;
    };
  };
}
interface Compilation {
  hooks: {
    processAssets: {
      tapPromise(
        options: { name: string; stage: number },
        callback: () => Promise<void>,
      ): void;
      tap(options: { name: string; stage: number }, callback: () => void): void;
    };
  };
  getAssets(): Asset[];
  updateAsset(
    name: string,
    source: unknown,
    info: NonNullable<Asset["info"]>,
  ): void;
  chunks: Iterable<Chunk>;
  chunkGraph?: {
    getChunkModulesIterable(chunk: Chunk): Iterable<ModuleOrigin>;
  };
}
interface Chunk {
  files: Iterable<string>;
}
interface Compiler {
  context: string;
  webpack: {
    version: string;
    Compilation: {
      PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE: number;
      PROCESS_ASSETS_STAGE_REPORT: number;
    };
    sources: { RawSource: new (code: string) => unknown };
    DefinePlugin: new (definitions: Record<string, string>) => {
      apply(compiler: Compiler): void;
    };
  };
  hooks: {
    thisCompilation: {
      tap(name: string, callback: (compilation: Compilation) => void): void;
    };
  };
}

const name = "WebGuardNext";

function entryWithRuntime(
  entry: unknown,
  runtimePath: string,
): Record<string, unknown> {
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
    throw new TypeError("WebGuard Next requires a named Webpack entry object");
  const entries = entry as Record<string, unknown>;
  const result = { ...entries };
  let injected = false;
  for (const key of ["main", "main-app"]) {
    if (!Object.hasOwn(entries, key)) continue;
    const original = entries[key];
    const descriptor =
      original && typeof original === "object" && !Array.isArray(original)
        ? (original as Record<string, unknown>)
        : undefined;
    const imports = descriptor ? descriptor.import : original;
    if (
      typeof imports !== "string" &&
      !(
        Array.isArray(imports) &&
        imports.every((item) => typeof item === "string")
      )
    )
      throw new TypeError(
        `WebGuard Next does not support the ${key} entry shape`,
      );
    const values = typeof imports === "string" ? [imports] : imports;
    const next = [
      runtimePath,
      ...values.filter((item) => item !== runtimePath),
    ];
    result[key] = descriptor ? { ...descriptor, import: next } : next;
    injected = true;
  }
  if (!injected)
    throw new Error(
      "WebGuard Next could not locate main/main-app browser startup; this Next/Webpack shape is unsupported",
    );
  return result;
}

class NextProtectionPlugin {
  constructor(
    private readonly preset: Preset,
    private readonly runtime: WebGuardOptions | false,
    private readonly frameworkPreset: "standard" | "inherit",
  ) {}

  apply(compiler: Compiler) {
    if (!compiler.webpack?.version?.startsWith("5."))
      throw new Error(
        "WebGuard Next requires Webpack 5; build with next build --webpack",
      );
    if (this.runtime !== false)
      new compiler.webpack.DefinePlugin({
        __WEBGUARD_NEXT_RUNTIME_OPTIONS__: JSON.stringify(this.runtime),
      }).apply(compiler);
    compiler.hooks.thisCompilation.tap(name, (compilation) => {
      const transformed = new Set<string>();
      compilation.hooks.processAssets.tapPromise(
        {
          name,
          // After minifiers, before Webpack RealContentHashPlugin (OPTIMIZE_HASH).
          stage:
            compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE + 1,
        },
        async () => {
          const origins = new Map<string, boolean>();
          for (const chunk of compilation.chunks) {
            let pure = false;
            try {
              pure = Boolean(
                compilation.chunkGraph &&
                isPureFrameworkChunk(
                  compilation.chunkGraph.getChunkModulesIterable(chunk),
                  compiler.context,
                ),
              );
            } catch {
              /* Unavailable graph data remains at the requested tier. */
            }
            for (const file of chunk.files)
              origins.set(file, (origins.get(file) ?? true) && pure);
          }
          for (const asset of compilation.getAssets()) {
            // Next's client compiler also emits server-only manifest helpers.
            // Only the public static namespace is browser output.
            if (!asset.name.startsWith("static/") || !/\.js$/i.test(asset.name))
              continue;
            const pureFramework = origins.get(asset.name) === true;
            const selectedPreset = chunkPreset(
              this.preset,
              pureFramework,
              this.frameworkPreset,
            );
            const policy = resolveConfig({ preset: selectedPreset });
            const source = asset.source.source();
            const code =
              typeof source === "string"
                ? source
                : Buffer.from(source).toString("utf8");
            const settings = createObfuscatorOptions(
              {
                level: policy.obfuscation.level,
                stringArrayEncoding: policy.obfuscation.stringArrayEncoding,
                reservedNames: policy.obfuscation.reservedNames,
                reservedProperties: policy.obfuscation.reservedProperties,
                renameProperties: false,
                deadCodeInjection: false,
                seed: policy.obfuscation.seed,
                sourceMap: false,
                inputFileName: asset.name,
              },
              code,
            );
            // Webpack's RealContentHashPlugin rewrites literal hash fragments
            // after this stage. Encoding or splitting those strings would leave
            // the runtime requesting stale lazy chunk URLs.
            const webpackSettings = {
              ...settings,
              reservedStrings: [
                ...(settings.reservedStrings ?? []),
                "[a-fA-F0-9]{8,}",
              ],
            };
            const protectedCode = preserveLicenseComments(
              code,
              stripSourceMapReferences(
                JavaScriptObfuscator.obfuscate(
                  stripSourceMapReferences(code),
                  webpackSettings,
                ).getObfuscatedCode(),
              ),
            );
            compilation.updateAsset(
              asset.name,
              new compiler.webpack.sources.RawSource(protectedCode),
              {
                webguardProtected: true,
                webguardTier: {
                  preset: selectedPreset,
                  origin: pureFramework
                    ? "framework"
                    : "application-or-unknown",
                  inputBytes: Buffer.byteLength(code),
                  outputBytes: Buffer.byteLength(protectedCode),
                },
              },
            );
            transformed.add(asset.name);
          }
        },
      );
      compilation.hooks.processAssets.tap(
        {
          name: `${name}Coverage`,
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
        },
        () => {
          for (const asset of compilation.getAssets())
            if (asset.name.startsWith("static/") && /\.map$/i.test(asset.name))
              throw new Error(
                `WebGuard Next refuses public source maps: ${asset.name}`,
              );
          // Metadata follows RealContentHash renames. Reject late, unprotected
          // chunk assets instead of silently declaring a partial build protected.
          const assets = new Map(
            compilation.getAssets().map((asset) => [asset.name, asset]),
          );
          for (const chunk of compilation.chunks)
            for (const file of chunk.files)
              if (
                /\.js$/i.test(file) &&
                !assets.get(file)?.info?.webguardProtected
              )
                throw new Error(
                  `WebGuard Next found an unprotected browser chunk: ${file}`,
                );
          if (transformed.size === 0)
            throw new Error(
              "WebGuard Next produced no protected browser JavaScript",
            );
          console.info(
            "[WebGuard Next] " +
              JSON.stringify({
                schemaVersion: 1,
                preset: this.preset,
                frameworkPreset: this.frameworkPreset,
                assets: compilation
                  .getAssets()
                  .filter((asset) => asset.info?.webguardTier)
                  .map((asset) => ({
                    path: asset.name,
                    ...asset.info!.webguardTier,
                  })),
              }),
          );
        },
      );
    });
  }
}

/** Production browser protection only. Next's SSR, RSC, server/edge and CSP stay under Next/application control. */
export function withWebGuard<T extends object>(
  nextConfig: T,
  options: WebGuardNextOptions = {},
) {
  const nextCli =
    /(?:[/\\]next[/\\]dist[/\\]bin[/\\]next|[/\\]\.bin[/\\]next)(?:\.js)?$/.test(
      process.argv[1] ?? "",
    );
  if (nextCli && process.argv[2] === "build") {
    if (
      process.argv.includes("--turbopack") ||
      process.argv.includes("--turbo")
    )
      throw new Error(
        "WebGuard Next: Turbopack production builds are unsupported; use next build --webpack",
      );
    if (!process.argv.includes("--webpack"))
      throw new Error(
        "WebGuard Next production protection requires next build --webpack (including projects with turbopack config)",
      );
  }
  if (
    !nextConfig ||
    typeof nextConfig !== "object" ||
    Array.isArray(nextConfig) ||
    typeof (nextConfig as { then?: unknown }).then === "function"
  )
    throw new TypeError(
      "withWebGuard requires a resolved Next config object; call it inside config functions",
    );
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("WebGuard Next options must be an object");
  for (const key of Object.keys(options))
    if (!["preset", "runtime", "frameworkPreset"].includes(key))
      throw new TypeError(`Unknown WebGuard Next option: ${key}`);
  if (
    options.frameworkPreset !== undefined &&
    options.frameworkPreset !== "standard" &&
    options.frameworkPreset !== "inherit"
  )
    throw new TypeError("frameworkPreset must be standard or inherit");
  const policy = resolveConfig({
    preset: options.preset === undefined ? "strict" : options.preset,
  });
  const original = nextConfig as T & {
    webpack?: unknown;
    productionBrowserSourceMaps?: boolean;
  };
  if (original.productionBrowserSourceMaps)
    throw new Error(
      "WebGuard Next requires productionBrowserSourceMaps:false; retain private maps outside public output instead",
    );
  if (original.webpack !== undefined && typeof original.webpack !== "function")
    throw new TypeError("Next webpack must be a function");
  let runtime: WebGuardOptions | false = false;
  if (options.runtime !== false) {
    if (
      options.runtime !== undefined &&
      (!options.runtime ||
        typeof options.runtime !== "object" ||
        Array.isArray(options.runtime))
    )
      throw new TypeError("Next runtime must be an object or false");
    if (
      options.runtime &&
      ("preset" in options.runtime || "onThreat" in options.runtime)
    )
      throw new TypeError(
        "Next runtime accepts serializable options only; use the client API for callbacks",
      );
    const guard = WebGuard.init(options.runtime ?? {});
    const validated = guard.getOptions();
    guard.destroy();
    runtime = {
      ...validated,
      preset: policy.preset,
      devtools: { detect: false, ...validated.devtools },
    };
  }
  const hook = original.webpack as
    | ((
        this: unknown,
        config: WebpackConfig,
        context: WebpackContext,
      ) => unknown)
    | undefined;
  const runtimePath = fileURLToPath(
    new URL("./next-runtime.js", import.meta.url),
  );
  return {
    ...nextConfig,
    productionBrowserSourceMaps: false as const,
    webpack(
      this: unknown,
      config: WebpackConfig,
      context: WebpackContext,
    ): WebpackConfig {
      const returned = hook ? hook.call(this, config, context) : config;
      if (
        returned &&
        typeof (returned as { then?: unknown }).then === "function"
      )
        throw new TypeError(
          "Next does not support async webpack hooks; move asynchronous work into an async next.config function and return a synchronous webpack hook",
        );
      if (!returned || typeof returned !== "object" || Array.isArray(returned))
        throw new TypeError("Next webpack hook must return its config object");
      const current = returned as WebpackConfig;
      if (context.dev || context.isServer || context.nextRuntime)
        return current;
      if (current.plugins !== undefined && !Array.isArray(current.plugins))
        throw new TypeError("Next webpack plugins must be an array");
      const result = {
        ...current,
        devtool: false,
        plugins: [
          ...(current.plugins ?? []),
          new NextProtectionPlugin(
            policy.preset,
            runtime,
            options.frameworkPreset ?? "standard",
          ),
        ],
        optimization: { ...current.optimization, realContentHash: true },
      };
      if (runtime !== false) {
        const entry = current.entry;
        result.entry =
          typeof entry === "function"
            ? async function (this: unknown, ...args: unknown[]) {
                return entryWithRuntime(
                  await entry.apply(this, args),
                  runtimePath,
                );
              }
            : entryWithRuntime(entry, runtimePath);
      }
      return result;
    },
  };
}
