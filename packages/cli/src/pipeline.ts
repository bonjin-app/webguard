import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import picomatch from "picomatch";
import { resolveConfig, type WebGuardConfigInput } from "@webguard/core";
import { obfuscate, stripSourceMapReferences } from "@webguard/obfuscator";
import { createManifest } from "@webguard/integrity";
import {
  assertAbsent,
  canonicalPath,
  listFiles,
  overlaps,
  stripCssSourceMaps,
} from "./fs-utils.js";
import { scanDirectory, type Finding } from "./scan.js";
import { addSubresourceIntegrity, sanitizeInlineSources } from "./html.js";
export interface ProtectionReport {
  version: 1;
  preset: string;
  output: string;
  files: {
    path: string;
    inputBytes: number;
    outputBytes: number;
    transformed: boolean;
    durationMs: number;
  }[];
  removedSources: string[];
  removedMaps: string[];
  findings: Finding[];
  privateArtifactsDir?: string;
  limitations: string[];
}
export interface ProtectOptions {
  output?: string;
  privateArtifactsDir?: string;
  config?: WebGuardConfigInput;
  /** Internal: Vite has already transformed chunks. */ alreadyTransformed?: boolean;
  publicBase?: string;
}
export async function protectDirectory(
  input: string,
  options: ProtectOptions = {},
): Promise<ProtectionReport> {
  const policy = resolveConfig(options.config);
  const source = await canonicalPath(resolve(input));
  const outputPath = resolve(options.output ?? `${resolve(input)}-protected`);
  const output = await canonicalPath(outputPath);
  const privatePath = resolve(
    options.privateArtifactsDir ?? `${outputPath}.private-maps`,
  );
  const privateDir = await canonicalPath(privatePath);
  if (overlaps(source, output) || overlaps(output, source))
    throw new Error(
      "Input and output directories must not overlap or be inside each other",
    );
  if (
    (policy.sourceMaps.privateArtifacts || options.privateArtifactsDir) &&
    [source, output].some(
      (p) => overlaps(p, privateDir) || overlaps(privateDir, p),
    )
  )
    throw new Error(
      "Private artifacts must not overlap input or be inside public output",
    );
  await assertAbsent(outputPath);
  if (policy.sourceMaps.privateArtifacts) await assertAbsent(privatePath);
  await listFiles(resolve(input));
  const paths = await listFiles(source);
  const originalFindings = await scanDirectory(source);
  if (originalFindings.some((f) => f.category === "potential-secret"))
    throw new Error(
      `Potential credentials detected in source deployment files: ${originalFindings
        .filter((f) => f.category === "potential-secret")
        .map((f) => f.path)
        .join(", ")}. Remove secrets before protecting.`,
    );
  if (
    paths.some(
      (p) => p === "webguard-manifest.json" || p === "webguard-report.json",
    )
  )
    throw new Error(
      "Input contains reserved WebGuard output files; use an unprotected build",
    );
  await mkdir(dirname(outputPath), { recursive: true });
  const stage = await mkdtemp(join(dirname(outputPath), ".webguard-stage-"));
  let privateStage: string | undefined,
    privatePublished = false;
  const report: ProtectionReport = {
    version: 1,
    preset: policy.preset,
    output: outputPath,
    files: [],
    removedSources: [],
    removedMaps: [],
    findings: [],
    limitations: [
      "Obfuscation is not encryption. Browser-delivered code and network traffic remain observable.",
      "Client-side checks are advisory; keep credentials and authorization on your server.",
      "Static secret detection is heuristic and cannot prove absence of secrets.",
    ],
  };
  const include = picomatch(policy.obfuscation.include),
    exclude = picomatch(policy.obfuscation.exclude);
  try {
    if (policy.sourceMaps.privateArtifacts) {
      await mkdir(dirname(privatePath), { recursive: true });
      privateStage = await mkdtemp(
        join(dirname(privatePath), ".webguard-private-"),
      );
    }
    for (const path of paths) {
      const from = join(source, path),
        to = join(stage, path);
      if (/\.map$/i.test(path)) {
        report.removedMaps.push(path);
        if (privateStage) {
          const dest = join(privateStage, "input-maps", path);
          await mkdir(dirname(dest), { recursive: true });
          await copyFile(from, dest);
        }
        continue;
      }
      if (/\.(?:tsx?|jsx|vue|svelte)$/i.test(path)) {
        report.removedSources.push(path);
        continue;
      }
      await mkdir(dirname(to), { recursive: true });
      const original = await readFile(from);
      let content: Uint8Array = original,
        transformed = false,
        durationMs = 0;
      if (/\.[cm]?js$/i.test(path)) {
        const cleaned = stripSourceMapReferences(original.toString("utf8"));
        if (
          policy.obfuscation.enabled &&
          include(path) &&
          !exclude(path) &&
          !options.alreadyTransformed
        ) {
          const {
            level,
            stringArrayEncoding,
            reservedNames,
            reservedProperties,
            renameProperties,
            deadCodeInjection,
            seed,
          } = policy.obfuscation;
          const result = await obfuscate(cleaned, {
            level,
            stringArrayEncoding,
            reservedNames,
            reservedProperties,
            renameProperties,
            deadCodeInjection,
            seed,
            sourceMap: !!privateStage,
            inputFileName: path,
          });
          content = Buffer.from(result.code);
          transformed = true;
          durationMs = result.durationMs;
          if (privateStage && result.map) {
            const map = join(privateStage, "generated-maps", `${path}.map`);
            await mkdir(dirname(map), { recursive: true });
            await writeFile(map, result.map);
          }
        } else content = Buffer.from(cleaned);
      } else if (/\.css$/i.test(path))
        content = Buffer.from(stripCssSourceMaps(original.toString("utf8")));
      else if (/\.html?$/i.test(path))
        content = Buffer.from(sanitizeInlineSources(original.toString("utf8")));
      await writeFile(to, content, { flag: "wx" });
      report.files.push({
        path,
        inputBytes: original.byteLength,
        outputBytes: content.byteLength,
        transformed,
        durationMs,
      });
    }
    if (policy.integrity.enabled) {
      const assets = new Map<string, Uint8Array>();
      for (const file of report.files)
        if (!/\.html?$/i.test(file.path))
          assets.set(file.path, await readFile(join(stage, file.path)));
      for (const file of report.files)
        if (/\.html?$/i.test(file.path)) {
          const html = addSubresourceIntegrity(
            await readFile(join(stage, file.path), "utf8"),
            file.path,
            assets,
            options.publicBase,
          );
          await writeFile(join(stage, file.path), html);
          file.outputBytes = Buffer.byteLength(html);
        }
    }
    report.findings = await scanDirectory(stage);
    if (report.findings.some((f) => f.category === "potential-secret"))
      throw new Error(
        `Potential credentials detected in deployment files: ${report.findings
          .filter((f) => f.category === "potential-secret")
          .map((f) => f.path)
          .join(", ")}. Remove secrets before protecting.`,
      );
    if (privateStage) report.privateArtifactsDir = privatePath;
    await writeFile(
      join(stage, "webguard-report.json"),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
    if (policy.integrity.enabled && policy.integrity.generateManifest)
      await writeFile(
        join(stage, "webguard-manifest.json"),
        JSON.stringify(await createManifest(stage), null, 2) + "\n",
        { flag: "wx" },
      );
    await assertAbsent(outputPath);
    if (privateStage) {
      await assertAbsent(privatePath);
      await rename(privateStage, privatePath);
      privatePublished = true;
    }
    await rename(stage, outputPath);
    return report;
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    if (privateStage)
      await rm(privatePublished ? privatePath : privateStage, {
        recursive: true,
        force: true,
      });
    throw error;
  }
}
