#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import metadata from "../package.json";
import {
  createSecurityHeaders,
  protectAppDirectory,
  protectDirectory,
  scanDirectory,
  verifyDeployment,
  verifyManifest,
  type Preset,
  type TrustedTypesMode,
} from "./build.js";

export const usage = `Usage: webguard <command> [directory] [options]

Commands:
  protect-app INPUT --output OUTPUT   Protect static output and add SDK + policy
  protect INPUT --output OUTPUT       Protect assets without SDK injection
  scan INPUT                          Report redacted heuristic findings
  verify INPUT [--base-url URL]        Check local manifest, optionally deployment
  report [INPUT]                      Read protection report (default: dist-protected)
  headers [--trusted-types MODE]      Print HTTP header JSON

Protection: --preset basic|standard|strict|custom --public-base /path/
App only: --restrict-shortcuts --restrict-context-menu --no-runtime --no-headers
Headers: --trusted-types enforce|report-only|off
General: --help, --version

Use fresh output directories. Obfuscation is not encryption. HTTP header artifacts
must be applied by your host; developer tools cannot be completely locked.`;

const definitions = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  output: { type: "string", short: "o" },
  preset: { type: "string" },
  "public-base": { type: "string" },
  "base-url": { type: "string" },
  "restrict-shortcuts": { type: "boolean" },
  "restrict-context-menu": { type: "boolean" },
  "trusted-types": { type: "string" },
  "no-runtime": { type: "boolean" },
  "no-headers": { type: "boolean" },
} as const;
const commandOptions: Record<string, string[]> = {
  "protect-app": [
    "output",
    "preset",
    "public-base",
    "restrict-shortcuts",
    "restrict-context-menu",
    "trusted-types",
    "no-runtime",
    "no-headers",
  ],
  protect: ["output", "preset", "public-base"],
  scan: [],
  verify: ["base-url"],
  report: [],
  headers: ["trusted-types"],
};

/** Parse before any filesystem mutation, rejecting ignored and conflicting options. */
export function parseCliArguments(args: string[]) {
  const { values, positionals, tokens } = parseArgs({
    args,
    options: definitions,
    allowPositionals: true,
    strict: true,
    tokens: true,
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name))
      throw new Error(`Duplicate option: --${token.name}`);
    seen.add(token.name);
    if (
      typeof token.value === "string" &&
      (!token.value.trim() || token.value.startsWith("-"))
    )
      throw new Error(`Invalid value for --${token.name}`);
  }
  if (values.help || values.version) {
    if (values.help && values.version)
      throw new Error("Choose --help or --version");
    if (
      seen.size !== 1 ||
      (values.version && positionals.length) ||
      positionals.length > 1
    )
      throw new Error("Help/version cannot be combined with command arguments");
    if (positionals[0] && !Object.hasOwn(commandOptions, positionals[0]))
      throw new Error(`Unknown command: ${positionals[0]}`);
    return {
      command: values.help ? "help" : "version",
      directory: undefined,
      values,
    };
  }
  const [command, directory, ...extra] = positionals;
  if (!command || !Object.hasOwn(commandOptions, command))
    throw new Error(`Unknown or missing command: ${command ?? ""}`);
  if (
    extra.length ||
    (command === "headers" && directory) ||
    (!["headers", "report"].includes(command) && !directory)
  )
    throw new Error(`Invalid directory arguments for ${command}`);
  for (const name of seen) {
    if (!commandOptions[command]!.includes(name))
      throw new Error(`--${name} is not supported by ${command}`);
  }
  if (
    values["no-runtime"] &&
    (values["restrict-shortcuts"] || values["restrict-context-menu"])
  )
    throw new Error(
      "Runtime restrictions cannot be combined with --no-runtime",
    );
  if (values["no-headers"] && values["trusted-types"])
    throw new Error("--trusted-types cannot be combined with --no-headers");
  if (
    values.preset &&
    !["basic", "standard", "strict", "custom"].includes(values.preset)
  )
    throw new Error("Invalid preset");
  if (
    values["trusted-types"] &&
    !["off", "report-only", "enforce"].includes(values["trusted-types"])
  )
    throw new Error("Invalid Trusted Types mode");
  return { command, directory, values };
}

export async function runCli(
  args: string[],
  io = {
    log: (value: string) => console.log(value),
    error: (value: string) => console.error(value),
  },
): Promise<number> {
  try {
    const { command, directory, values } = parseCliArguments(args);
    const emit = (value: unknown) => io.log(JSON.stringify(value, null, 2));
    if (command === "help") {
      io.log(usage);
      return 0;
    }
    if (command === "version") {
      io.log(metadata.version);
      return 0;
    }
    if (command === "headers") {
      emit(
        createSecurityHeaders({
          ...(values["trusted-types"]
            ? { trustedTypes: values["trusted-types"] as TrustedTypesMode }
            : {}),
        }),
      );
      return 0;
    }
    if (command === "report") {
      io.log(
        await readFile(
          join(directory ?? "dist-protected", "webguard-report.json"),
          "utf8",
        ),
      );
      return 0;
    }
    if (command === "scan") {
      const findings = await scanDirectory(directory!);
      emit(findings);
      return findings.some((finding) => finding.severity === "error") ? 1 : 0;
    }
    if (command === "verify") {
      const manifest = JSON.parse(
        await readFile(join(directory!, "webguard-manifest.json"), "utf8"),
      );
      const local = await verifyManifest(directory!, manifest);
      emit(local);
      if (!local.valid) return 1;
      if (values["base-url"]) {
        const report = JSON.parse(
          await readFile(join(directory!, "webguard-report.json"), "utf8"),
        );
        const remote = await verifyDeployment(values["base-url"], manifest, [
          ...report.removedMaps,
          ...report.removedSources,
        ]);
        emit(remote);
        return remote.valid ? 0 : 1;
      }
      return 0;
    }
    const config = values.preset ? { preset: values.preset as Preset } : {};
    const options = {
      output: values.output,
      publicBase: values["public-base"],
    };
    if (command === "protect")
      emit(await protectDirectory(directory!, { ...options, config }));
    else
      emit(
        await protectAppDirectory(directory!, {
          ...options,
          config,
          runtime: values["no-runtime"]
            ? false
            : {
                devtools: {
                  ...(values["restrict-shortcuts"]
                    ? { blockShortcuts: true }
                    : {}),
                  ...(values["restrict-context-menu"]
                    ? { blockContextMenu: true }
                    : {}),
                },
              },
          headers: values["no-headers"]
            ? false
            : {
                ...(values["trusted-types"]
                  ? {
                      trustedTypes: values["trusted-types"] as TrustedTypesMode,
                    }
                  : {}),
              },
        }),
      );
    return 0;
  } catch (error) {
    io.error(
      `WebGuard: ${error instanceof Error ? error.message : String(error)}\n\n${usage}`,
    );
    return 1;
  }
}

/** npm creates a .bin symlink; compare its canonical target with this module. */
export function isCliEntrypoint(argument: string | undefined): boolean {
  if (!argument) return false;
  try {
    return (
      realpathSync(resolve(argument)) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isCliEntrypoint(process.argv[1]))
  process.exitCode = await runCli(process.argv.slice(2));
