#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import {
  resolveConfig,
  createSecurityHeaders,
  type TrustedTypesMode,
  type WebGuardConfigInput,
} from "@webguard/core";
import { verifyManifest } from "@webguard/integrity";
import { protectDirectory } from "./pipeline.js";
import { scanDirectory } from "./scan.js";
import { verifyDeployment } from "./remote.js";
const program = new Command()
  .name("webguard")
  .description("Local build protection. Obfuscation is not encryption.")
  .version("0.1.0");
interface Options {
  output?: string;
  config?: string;
  preset?: string;
  privateArtifactsDir?: string;
  privateArtifacts?: boolean;
  command?: string;
  input?: string;
  baseUrl?: string;
  publicBase?: string;
}
async function loadConfig(options: Options): Promise<WebGuardConfigInput> {
  let config: WebGuardConfigInput = {};
  const file = resolve(options.config ?? "webguard.config.ts");
  try {
    await readFile(file);
    const jiti = createJiti(import.meta.url, {
      alias: {
        "@webguard/core": fileURLToPath(import.meta.resolve("@webguard/core")),
      },
    });
    const mod = await jiti.import<{ default?: WebGuardConfigInput }>(file);
    config = mod.default ?? (mod as WebGuardConfigInput);
  } catch (error) {
    if (options.config || (error as NodeJS.ErrnoException).code !== "ENOENT")
      throw error;
  }
  resolveConfig(config); // Validate before spreading: primitives must not silently become defaults.
  return resolveConfig({
    ...config,
    ...(options.preset
      ? { preset: options.preset as WebGuardConfigInput["preset"] }
      : {}),
    sourceMaps: {
      ...config.sourceMaps,
      ...(options.privateArtifacts === false
        ? { privateArtifacts: false }
        : {}),
    },
  });
}
function protectOptions(command: Command) {
  return command
    .option(
      "-o, --output <directory>",
      "New output directory (default: INPUT-protected)",
    )
    .option(
      "-c, --config <file>",
      "Trusted local TS/JS config (executed as code)",
    )
    .option("--preset <preset>", "basic, standard, strict or custom")
    .option(
      "--private-artifacts-dir <directory>",
      "Directory outside public output",
    )
    .option(
      "--public-base <path>",
      "Public deployment base for local HTML resource URLs",
      "/",
    )
    .option("--no-private-artifacts", "Do not retain private source maps");
}
interface HeaderOptions {
  trustedTypes: string;
  allowScriptOrigin?: string[];
  allowStyleOrigin?: string[];
  allowConnectOrigin?: string[];
  allowImgOrigin?: string[];
  allowFontOrigin?: string[];
  allowWorkerOrigin?: string[];
}
program
  .command("headers")
  .description(
    "Print strict HTTP response header JSON; does not apply it to a server or lock developer tools",
  )
  .option("--trusted-types <mode>", "enforce, report-only or off", "enforce")
  .option(
    "--allow-script-origin <origins...>",
    "Additional exact script origins",
  )
  .option("--allow-style-origin <origins...>", "Additional exact style origins")
  .option("--allow-connect-origin <origins...>", "Additional exact API origins")
  .option("--allow-img-origin <origins...>", "Additional exact image origins")
  .option("--allow-font-origin <origins...>", "Additional exact font origins")
  .option(
    "--allow-worker-origin <origins...>",
    "Additional exact worker origins",
  )
  .action((options: HeaderOptions) => {
    console.log(
      JSON.stringify(
        createSecurityHeaders({
          trustedTypes: options.trustedTypes as TrustedTypesMode,
          allowedOrigins: {
            script: options.allowScriptOrigin,
            style: options.allowStyleOrigin,
            connect: options.allowConnectOrigin,
            img: options.allowImgOrigin,
            font: options.allowFontOrigin,
            worker: options.allowWorkerOrigin,
          },
        }),
        null,
        2,
      ),
    );
  });
program
  .command("init")
  .description("Create a config without replacing an existing file")
  .option("-o, --output <file>", "Config file", "webguard.config.ts")
  .action(async (options: Options) => {
    const path = resolve(options.output!);
    await writeFile(
      path,
      "import { defineConfig } from '@webguard/core';\n\nexport default defineConfig({\n  preset: 'standard',\n  obfuscation: { include: ['**/*.{js,mjs,cjs}'], exclude: ['**/vendor/**'] },\n  sourceMaps: { public: false, privateArtifacts: true },\n  integrity: { enabled: true, generateManifest: true }\n});\n",
      { flag: "wx" },
    );
    console.log(`Created ${path}`);
  });
protectOptions(
  program
    .command("protect <directory>")
    .description("Protect a built directory; preserve input"),
).action(async (directory: string, options: Options) => {
  const report = await protectDirectory(directory, {
    output: options.output,
    privateArtifactsDir: options.privateArtifactsDir,
    publicBase: options.publicBase,
    config: await loadConfig(options),
  });
  console.log(JSON.stringify(report, null, 2));
});
protectOptions(
  program
    .command("build")
    .description(
      "Run your explicit local build command, then protect its output",
    )
    .requiredOption("--command <command>", "Trusted local build command")
    .option("--input <directory>", "Build output", "dist"),
).action(async (options: Options) => {
  const code = await new Promise<number>((done, reject) => {
    const child = spawn(options.command!, { shell: true, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => done(code ?? 1));
  });
  if (code !== 0) throw new Error(`Build exited with code ${code}`);
  console.log(
    JSON.stringify(
      await protectDirectory(options.input!, {
        output: options.output,
        privateArtifactsDir: options.privateArtifactsDir,
        publicBase: options.publicBase,
        config: await loadConfig(options),
      }),
      null,
      2,
    ),
  );
});
program
  .command("scan <directory>")
  .description(
    "Report heuristic findings; matched credential values are redacted",
  )
  .action(async (directory: string) => {
    const findings = await scanDirectory(directory);
    console.log(JSON.stringify(findings, null, 2));
    if (findings.some((f) => f.severity === "error")) process.exitCode = 1;
  });
program
  .command("verify <directory>")
  .description(
    "Verify every asset against a local manifest; optionally check deployment",
  )
  .option(
    "--base-url <url>",
    "Compare a deployment with this locally trusted manifest",
  )
  .action(async (directory: string, options: Options) => {
    const manifest: unknown = JSON.parse(
      await readFile(join(directory, "webguard-manifest.json"), "utf8"),
    );
    const result = await verifyManifest(directory, manifest);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) {
      process.exitCode = 1;
      return;
    }
    if (options.baseUrl) {
      const report = JSON.parse(
        await readFile(join(directory, "webguard-report.json"), "utf8"),
      );
      const remote = await verifyDeployment(
        options.baseUrl,
        manifest as Parameters<typeof verifyDeployment>[1],
        [...report.removedMaps, ...report.removedSources],
      );
      console.log(JSON.stringify(remote, null, 2));
      if (!remote.valid) process.exitCode = 1;
    }
  });
program
  .command("report [directory]")
  .description("Read a generated protection report")
  .action(async (directory = "dist-protected") => {
    console.log(
      await readFile(join(directory, "webguard-report.json"), "utf8"),
    );
  });
program.parseAsync().catch((error: unknown) => {
  console.error(
    `WebGuard: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
