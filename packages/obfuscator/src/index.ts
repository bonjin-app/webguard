import JavaScriptObfuscator from "javascript-obfuscator";
import { parse } from "acorn";
import {
  createObfuscatorOptions,
  preserveLicenseComments,
  type ObfuscateOptions,
} from "./options.js";
export { createObfuscatorOptions, preserveLicenseComments } from "./options.js";
export type { ObfuscateOptions } from "./options.js";

export interface ObfuscationResult {
  code: string;
  /** Private artifact only: the returned code never links to this map. */
  map?: string;
  originalBytes: number;
  protectedBytes: number;
  durationMs: number;
}

/** Remove mapping directives using parser-provided comment ranges, never string substitution. */
export function stripSourceMapReferences(source: string): string {
  const collectRanges = (sourceType: "module" | "script") => {
    // A failed parse may already have visited comments. Keep each attempt isolated.
    const ranges: { start: number; end: number }[] = [];
    parse(source, {
      ecmaVersion: "latest",
      sourceType,
      allowHashBang: true,
      onComment(_block, text, start, end) {
        if (/^\s*[#@]\s*sourceMappingURL\s*=/.test(text))
          ranges.push({ start, end });
      },
    });
    return ranges;
  };
  let ranges: { start: number; end: number }[];
  try {
    ranges = collectRanges("module");
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    ranges = collectRanges("script");
  }
  let output = "";
  let cursor = 0;
  for (const { start, end } of ranges) {
    output +=
      source.slice(cursor, start) +
      source.slice(start, end).replace(/[^\r\n\u2028\u2029]/g, " ");
    cursor = end;
  }
  return output + source.slice(cursor);
}

/** Transform already-built JavaScript. No eval or Function is added by this engine. */
export async function obfuscate(
  source: string,
  options: ObfuscateOptions = {},
): Promise<ObfuscationResult> {
  if (typeof source !== "string")
    throw new TypeError("source must be a string");
  const start = performance.now();
  const settings = createObfuscatorOptions(options, source);
  const result = JavaScriptObfuscator.obfuscate(
    stripSourceMapReferences(source),
    settings,
  );
  const code = preserveLicenseComments(
    source,
    stripSourceMapReferences(result.getObfuscatedCode()).trimEnd(),
  );
  const map = settings.sourceMap ? result.getSourceMap() : undefined;
  const encoder = new TextEncoder();
  return {
    code,
    ...(map ? { map } : {}),
    originalBytes: encoder.encode(source).byteLength,
    protectedBytes: encoder.encode(code).byteLength,
    durationMs: performance.now() - start,
  };
}
