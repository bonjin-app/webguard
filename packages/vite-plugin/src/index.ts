import { realpathSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Plugin, ResolvedConfig } from "vite";
import picomatch from "picomatch";
import { resolveConfig, type WebGuardConfigInput } from "@webguard/core";
import { obfuscate } from "@webguard/obfuscator";
import { protectDirectory, hasPotentialCredential } from "@webguard/cli";

function canonicalDirectory(path: string): string {
  try {
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(canonicalDirectory(parent), basename(path));
  }
}

function validateOutputDirectory(
  output: { file?: unknown; dir?: unknown } | undefined,
  root: string,
  outDir: string,
  cwd: unknown,
  name: string,
) {
  if (output?.file !== undefined)
    throw new Error(
      `WebGuard does not support ${name}.file; configure build.outDir instead`,
    );
  if (output?.dir === undefined) return;
  const directory = canonicalDirectory(resolve(root, outDir));
  // Vite prepares directories relative to root; bundlers resolve them against cwd.
  // Both must target the directory that closeBundle will protect.
  if (
    typeof output.dir !== "string" ||
    !output.dir ||
    typeof cwd !== "string" ||
    canonicalDirectory(resolve(root, output.dir)) !== directory ||
    canonicalDirectory(resolve(cwd, output.dir)) !== directory
  )
    throw new Error(
      `WebGuard requires ${name}.dir to resolve to build.outDir; configure build.outDir instead`,
    );
}

/** Build-only protection. Transform before Vite finalizes content-hashed filenames. */
export function webguard(input: WebGuardConfigInput = {}): Plugin {
  const policy = resolveConfig(input);
  let vite: ResolvedConfig;
  let written = false;
  const metrics = new Map<
    string,
    { inputBytes: number; outputBytes: number; durationMs: number }
  >();
  const include = picomatch(policy.obfuscation.include),
    exclude = picomatch(policy.obfuscation.exclude);
  return {
    name: "webguard",
    apply: "build",
    enforce: "post",
    buildStart() {
      written = false;
      metrics.clear();
    },
    writeBundle() {
      written = true;
    },
    config() {
      return {
        build: {
          sourcemap: policy.sourceMaps.privateArtifacts ? "hidden" : false,
        },
      };
    },
    configResolved(config) {
      vite = config;
      // Vite generates workers in memory, then emits them as main-build assets.
      // Their output options do not designate a directory for us to replace.
      if (config.isWorker) return;
      if (config.build.lib || config.build.ssr || config.build.write === false)
        throw new Error(
          "WebGuard Vite plugin currently supports written browser application builds only",
        );
      for (const [name, bundler] of [
        ["rollupOptions", config.build.rollupOptions],
        ["rolldownOptions", config.build.rolldownOptions],
      ] as const) {
        const output = bundler?.output;
        if (Array.isArray(output))
          throw new Error(
            "WebGuard supports a single output directory; output arrays are not supported",
          );
        validateOutputDirectory(
          output,
          config.root,
          config.build.outDir,
          bundler?.cwd ?? process.cwd(),
          `${name}.output`,
        );
      }
    },
    outputOptions: {
      order: "post",
      handler(output) {
        if (vite.isWorker) return null;
        const bundler = vite.build.rolldownOptions ?? vite.build.rollupOptions;
        validateOutputDirectory(
          output,
          vite.root,
          vite.build.outDir,
          bundler?.cwd ?? process.cwd(),
          "output",
        );
        return null;
      },
    },
    renderChunk: {
      order: "post",
      async handler(code, chunk) {
        if (hasPotentialCredential(code, chunk.fileName))
          throw new Error(
            `Potential credentials detected before protection: ${chunk.fileName}`,
          );
        if (
          !policy.obfuscation.enabled ||
          !include(chunk.fileName) ||
          exclude(chunk.fileName)
        )
          return null;
        const {
          level,
          stringArrayEncoding,
          reservedNames,
          reservedProperties,
          renameProperties,
          deadCodeInjection,
          seed,
        } = policy.obfuscation;
        const result = await obfuscate(code, {
          level,
          stringArrayEncoding,
          reservedNames,
          reservedProperties,
          renameProperties,
          deadCodeInjection,
          seed,
          sourceMap: policy.sourceMaps.privateArtifacts,
          inputFileName: chunk.fileName,
        });
        metrics.set(chunk.name, {
          inputBytes: result.originalBytes,
          outputBytes: result.protectedBytes,
          durationMs: result.durationMs,
        });
        return { code: result.code, map: result.map ?? null };
      },
    },
    closeBundle: {
      order: "post",
      sequential: true,
      async handler() {
        if (vite.isWorker || !written) return;
        const output = resolve(vite.root, vite.build.outDir),
          id = randomUUID();
        const staged = join(dirname(output), `.webguard-output-${id}`),
          backup = join(dirname(output), `.webguard-backup-${id}`);
        const privateArtifactsDir = join(
          dirname(output),
          ".webguard-private",
          `${output.split(/[\\/]/).pop()}-${id}`,
        );
        await protectDirectory(output, {
          output: staged,
          privateArtifactsDir,
          config: policy,
          alreadyTransformed: true,
          publicBase: vite.base,
        });
        // protectDirectory's output field describes its staging target; rewrite before publication.
        const { readFile, writeFile } = await import("node:fs/promises");
        const reportPath = join(staged, "webguard-report.json");
        const report = JSON.parse(await readFile(reportPath, "utf8"));
        report.output = output;
        report.integration = "vite";
        report.chunkTransforms = Object.fromEntries(metrics);
        await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
        let moved = false;
        try {
          await rename(output, backup);
          moved = true;
          await rename(staged, output);
        } catch (error) {
          if (moved) await rename(backup, output);
          await rm(staged, { recursive: true, force: true });
          throw error;
        }
        await rm(backup, { recursive: true, force: true });
        // Parent private artifacts directory is created only when maps were retained.
        if (policy.sourceMaps.privateArtifacts)
          await mkdir(dirname(privateArtifactsDir), { recursive: true });
      },
    },
  };
}
export default webguard;

export { webguardApp, type WebGuardAppOptions } from "./app.js";
