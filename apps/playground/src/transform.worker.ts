import {
  createObfuscatorOptions,
  preserveLicenseComments,
} from "@webguard/obfuscator/options";
import type { ObfuscationLevel } from "@webguard/core";
// Chance in the upstream browser bundle assigns this legacy worker global.
// Define it before loading that bundle so its assignment also works in an ES module worker.
Object.defineProperty(globalThis, "chance", {
  value: undefined,
  writable: true,
  configurable: true,
});
self.onmessage = async (
  event: MessageEvent<{ code: string; preset: string }>,
) => {
  try {
    const { default: JavaScriptObfuscator } =
      await import("javascript-obfuscator/dist/index.browser.js");
    const start = performance.now();
    const result = JavaScriptObfuscator.obfuscate(
      event.data.code,
      createObfuscatorOptions(
        { level: event.data.preset as ObfuscationLevel },
        event.data.code,
      ),
    );
    self.postMessage({
      code: preserveLicenseComments(
        event.data.code,
        result.getObfuscatedCode(),
      ),
      elapsed: performance.now() - start,
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
