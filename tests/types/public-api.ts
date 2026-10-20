/** Compile-only consumer contracts. Included by the root strict TypeScript check. */
import {
  defineConfig,
  resolveConfig,
  type Preset,
  type StringArrayEncoding,
  type ResolvedConfig,
} from "@webguard/core";
import {
  WebGuard,
  type WebGuardInstance,
  type ThreatEvent,
} from "@webguard/browser";
import {
  obfuscate,
  createObfuscatorOptions,
  type ObfuscationResult,
} from "@webguard/obfuscator";

const input = defineConfig({
  preset: "strict",
  obfuscation: { seed: 7, reservedNames: ["^publicApi$"] },
  sourceMaps: { public: false, privateArtifacts: true },
});
const literalPreset: "strict" = input.preset;
const preset: Preset = literalPreset;
const resolved: ResolvedConfig = resolveConfig(input);
const publicMapsDisabled: false = resolved.sourceMaps.public;
const event: ThreatEvent = {
  type: "integrity-mismatch",
  timestamp: Date.now(),
};
const guard: WebGuardInstance = WebGuard.init({
  preset,
  devtools: { blockShortcuts: false, detect: false, response: "monitor" },
  onThreat(threat) {
    const timestamp: number = threat.timestamp;
    void timestamp;
  },
});
const output: Promise<ObfuscationResult> = obfuscate(
  "export const result = 42;",
  { level: "high", seed: 7, sourceMap: true },
);
createObfuscatorOptions({ level: "basic" });
const encoding: StringArrayEncoding = "rc4";
defineConfig({ obfuscation: { stringArrayEncoding: encoding } });
obfuscate("export const message = 'hello';", { stringArrayEncoding: "base64" });
// @ts-expect-error Encoding modes are a closed union.
obfuscate("const value = 1;", { stringArrayEncoding: "hex" });
// @ts-expect-error Encoding modes are a closed union in configuration too.
defineConfig({ obfuscation: { stringArrayEncoding: "hex" } });
void [guard, event, output, publicMapsDisabled];

// @ts-expect-error Public source maps are forbidden by the public configuration type.
defineConfig({ sourceMaps: { public: true } });
// @ts-expect-error Presets are a closed union.
resolveConfig({ preset: "maximum" });
// @ts-expect-error Obfuscation levels are a closed union.
defineConfig({ obfuscation: { level: "strict" } });
// @ts-expect-error Reserved patterns contain strings.
resolveConfig({ obfuscation: { reservedProperties: [42] } });
// @ts-expect-error Browser settings live in the nested devtools object.
WebGuard.init({ blockShortcuts: true });
// @ts-expect-error Browser responses are advisory modes only.
WebGuard.init({ devtools: { response: "freeze" } });
// @ts-expect-error Callbacks receive the exported event shape.
WebGuard.init({ onThreat: (threat: { type: number }) => void threat });
// @ts-expect-error The engine does not accept arbitrary underlying unsafe options.
obfuscate("const a = 1;", { selfDefending: true });
// @ts-expect-error Seeds are numeric.
obfuscate("const a = 1;", { seed: "7" });
// @ts-expect-error Transformation results are asynchronous.
const synchronousResult: ObfuscationResult = obfuscate("const a = 1;");
void synchronousResult;
