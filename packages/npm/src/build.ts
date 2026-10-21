import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createApplicationProtector } from "../../cli/src/application.js";
export {
  createDomIdentifierGenerator,
  type DomIdentifierOptions,
} from "../../cli/src/dom-identifiers.js";

export {
  protectDirectory,
  type ProtectOptions,
  type ProtectionReport,
} from "../../cli/src/pipeline.js";
export { scanDirectory, type Finding } from "../../cli/src/scan.js";
export { verifyDeployment } from "../../cli/src/remote.js";
export {
  createManifest,
  verifyManifest,
  hashContent,
  type IntegrityManifest,
} from "@webguard/integrity";
export {
  defineConfig,
  resolveConfig,
  createSecurityHeaders,
} from "@webguard/core";
export type {
  WebGuardConfigInput,
  WebGuardConfig,
  SecurityHeadersOptions,
  TrustedTypesMode,
  Preset,
} from "@webguard/core";
export type { ProtectAppOptions } from "../../cli/src/application.js";

/** Protect static browser output without importing Vite or starting the browser SDK. */
export const protectAppDirectory = createApplicationProtector(async () =>
  readFile(
    fileURLToPath(import.meta.resolve("uulab-webguard/browser.global.js")),
    "utf8",
  ),
);
