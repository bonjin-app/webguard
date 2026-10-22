import type { ObfuscatorOptions } from "javascript-obfuscator";
import { parse } from "acorn";
import {
  resolveConfig,
  type ObfuscationLevel,
  type StringArrayEncoding,
} from "@webguard/core";

export interface ObfuscateOptions {
  level?: ObfuscationLevel;
  stringArrayEncoding?: StringArrayEncoding;
  reservedNames?: string[];
  reservedProperties?: string[];
  renameProperties?: boolean;
  deadCodeInjection?: boolean;
  seed?: number;
  sourceMap?: boolean;
  inputFileName?: string;
  /** Namespace generated helper globals when separately transforming script blocks. */
  identifiersPrefix?: string;
}
/** Preserve module URLs and bundler filename placeholders for later bundle finalization.
 * These strings intentionally remain plaintext, even when other strings are encoded.
 */
function reservedModuleStrings(source: string): string[] {
  let ast;
  try {
    ast = parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowHashBang: true,
    });
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    ast = parse(source, {
      ecmaVersion: "latest",
      sourceType: "script",
      allowHashBang: true,
    });
  }
  const strings = new Set<string>();
  const literalValue = (node: unknown): string | undefined => {
    if (
      node &&
      typeof node === "object" &&
      "type" in node &&
      node.type === "Literal" &&
      "value" in node &&
      typeof node.value === "string"
    )
      return node.value;
    return undefined;
  };
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    if (
      [
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
        "ImportExpression",
      ].includes(String(record.type))
    ) {
      const value = literalValue(record.source);
      if (value !== undefined) strings.add(value);
    }
    if (
      record.type === "TemplateElement" &&
      record.value &&
      typeof record.value === "object"
    ) {
      const value = record.value as { cooked?: unknown; raw?: unknown };
      for (const text of [value.cooked, value.raw])
        if (typeof text === "string" && /!~\{[^}]*\}~|__VITE_.*?__/.test(text))
          strings.add(text);
    }
    const literal = literalValue(node);
    if (literal !== undefined && /!~\{[^}]*\}~|__VITE_.*?__/.test(literal))
      strings.add(literal);
    for (const value of Object.values(record)) visit(value);
  };
  visit(ast);
  return [...strings].map(
    (value) => `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
  );
}

/** Options shared by the Node engine and the browser playground engine. */
export function createObfuscatorOptions(
  options: ObfuscateOptions = {},
  source?: string,
): ObfuscatorOptions {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Options must be an object");
  const allowed = [
    "level",
    "stringArrayEncoding",
    "reservedNames",
    "reservedProperties",
    "renameProperties",
    "deadCodeInjection",
    "seed",
    "sourceMap",
    "inputFileName",
    "identifiersPrefix",
  ];
  for (const key of Object.keys(options))
    if (!allowed.includes(key))
      throw new TypeError(`Unknown obfuscation option: ${key}`);
  if (options.sourceMap !== undefined && typeof options.sourceMap !== "boolean")
    throw new TypeError("sourceMap must be a boolean");
  if (
    options.inputFileName !== undefined &&
    (typeof options.inputFileName !== "string" || !options.inputFileName.trim())
  )
    throw new TypeError("inputFileName must be a non-empty string");
  if (
    options.identifiersPrefix !== undefined &&
    (typeof options.identifiersPrefix !== "string" ||
      !/^[$A-Z_a-z][$\w]*$/.test(options.identifiersPrefix))
  )
    throw new TypeError(
      "identifiersPrefix must be a JavaScript identifier prefix",
    );
  const {
    sourceMap: _sourceMap,
    inputFileName: _inputFileName,
    identifiersPrefix: _identifiersPrefix,
    ...input
  } = options;
  const config = resolveConfig({ obfuscation: input }).obfuscation;
  const basic = config.level === "basic";
  const high = config.level === "high";
  return {
    target: "browser-no-eval",
    compact: true,
    simplify: !basic,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    identifiersPrefix: options.identifiersPrefix ?? "",
    renameProperties: config.renameProperties,
    renamePropertiesMode: "safe",
    reservedNames: [...config.reservedNames, ...config.reservedProperties],
    reservedStrings: source === undefined ? [] : reservedModuleStrings(source),
    controlFlowFlattening: config.level === "high",
    controlFlowFlatteningThreshold: high ? 0.75 : 0.5,
    deadCodeInjection: config.deadCodeInjection,
    deadCodeInjectionThreshold: 0.2,
    stringArray: !basic,
    stringArrayEncoding:
      config.stringArrayEncoding === "none" ? [] : [config.stringArrayEncoding],
    stringArrayThreshold: high ? 1 : 0.5,
    stringArrayCallsTransform: high,
    stringArrayCallsTransformThreshold: high ? 0.75 : 0.5,
    stringArrayRotate: !basic,
    stringArrayShuffle: !basic,
    stringArrayWrappersCount: basic ? 0 : high ? 2 : 1,
    stringArrayWrappersType: high ? "function" : "variable",
    stringArrayWrappersParametersMaxCount: 3,
    stringArrayWrappersChainedCalls: true,
    numbersToExpressions: high,
    transformObjectKeys: false,
    splitStrings: high,
    splitStringsChunkLength: 8,
    unicodeEscapeSequence: false,
    debugProtection: false,
    debugProtectionInterval: 0,
    selfDefending: false,
    disableConsoleOutput: false,
    seed: config.seed,
    sourceMap: options.sourceMap ?? false,
    sourceMapMode: "separate",
    sourceMapSourcesMode: "sources-content",
    inputFileName: options.inputFileName ?? "input.js",
  };
}

/** Append exact legal comment text without shifting generated code's source-map positions. */
export function preserveLicenseComments(source: string, code: string): string {
  const collect = (input: string): string[] => {
    const attempt = (sourceType: "module" | "script"): string[] => {
      const comments: string[] = [];
      parse(input, {
        ecmaVersion: "latest",
        sourceType,
        allowHashBang: true,
        onComment(_block, text, start, end) {
          const raw = input.slice(start, end);
          if (
            !/^\s*[#@]\s*sourceMappingURL\s*=/.test(text) &&
            (raw.startsWith("/*!") ||
              /@license|@preserve|copyright/i.test(text))
          )
            comments.push(raw);
        },
      });
      return comments;
    };
    try {
      return attempt("module");
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return attempt("script");
    }
  };
  const retained = new Set(collect(code));
  const missing = [...new Set(collect(source))].filter(
    (comment) => !retained.has(comment),
  );
  return missing.length ? `${code}\n${missing.join("\n")}` : code;
}
