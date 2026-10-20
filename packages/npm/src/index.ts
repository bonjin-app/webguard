import { fileURLToPath } from "node:url";
import {
  createWebGuardApp,
  type WebGuardAppOptions,
} from "../../vite-plugin/src/app";
export { webguard } from "@webguard/vite-plugin";
export type { WebGuardAppOptions } from "../../vite-plugin/src/app";
export type {
  WebGuardConfigInput,
  Preset,
  ObfuscationLevel,
  StringArrayEncoding,
} from "@webguard/core";

/** One-setting Vite integration with a browser entry resolved from this installed package. */
export function webguardApp(input: WebGuardAppOptions = {}) {
  return createWebGuardApp(input, () =>
    fileURLToPath(import.meta.resolve("uulab-webguard/browser")),
  );
}
