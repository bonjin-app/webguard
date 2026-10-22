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

export function assertStaticScript(
  source: string,
  kind: "classic" | "module",
  label: string,
) {
  if (/<(?:%|\?(?:php|=))/i.test(source))
    throw new Error(
      `Unsupported nested code string or server template in ${label}; protect resolved static JavaScript instead`,
    );
  let tree: unknown;
  try {
    tree = parse(source, {
      ecmaVersion: "latest",
      sourceType: kind === "module" ? "module" : "script",
    });
  } catch {
    throw new Error(
      `Unsupported JavaScript or server-template syntax in ${label}`,
    );
  }
  const constants = new Map<string, unknown>();
  // Propagate only unambiguous top-level constants. Any binding with the same
  // name elsewhere disables propagation, rather than guessing across scopes.
  const bindings = new Map<string, number>();
  const bind = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type === "Identifier") {
      const name = node.name as string;
      bindings.set(name, (bindings.get(name) ?? 0) + 1);
    } else if (node.type === "ObjectPattern") {
      for (const property of node.properties as Record<string, unknown>[])
        bind(
          property.type === "RestElement" ? property.argument : property.value,
        );
    } else if (node.type === "ArrayPattern") {
      for (const element of node.elements as unknown[]) bind(element);
    } else if (node.type === "AssignmentPattern") bind(node.left);
    else if (node.type === "RestElement") bind(node.argument);
  };
  for (const statement of (tree as { body: Record<string, unknown>[] }).body) {
    const node =
      statement.type === "ExportNamedDeclaration"
        ? (statement.declaration as Record<string, unknown> | undefined)
        : statement;
    if (node?.type === "VariableDeclaration" && node.kind === "const")
      for (const declaration of node.declarations as Record<
        string,
        unknown
      >[]) {
        const id = declaration.id as Record<string, unknown>;
        if (id.type === "Identifier")
          constants.set(id.name as string, declaration.init);
      }
  }
  const collect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === "VariableDeclarator") bind(node.id);
    if (
      [
        "FunctionDeclaration",
        "FunctionExpression",
        "ArrowFunctionExpression",
      ].includes(node.type as string)
    ) {
      bind(node.id);
      for (const parameter of node.params as unknown[]) bind(parameter);
    }
    if (["ClassDeclaration", "ClassExpression"].includes(node.type as string))
      bind(node.id);
    if (
      [
        "ImportSpecifier",
        "ImportDefaultSpecifier",
        "ImportNamespaceSpecifier",
      ].includes(node.type as string)
    )
      bind(node.local);
    if (node.type === "CatchClause") bind(node.param);
    for (const child of Object.values(node)) collect(child);
  };
  collect(tree);
  for (const name of constants.keys())
    if (bindings.get(name) !== 1) constants.delete(name);
  const staticString = (
    value: unknown,
    seen = new Set<string>(),
  ): string | undefined => {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type === "Literal" && typeof node.value === "string")
      return node.value;
    if (node.type === "TemplateLiteral")
      return (node.quasis as { value: { cooked: string } }[])
        .map((part) => part.value.cooked)
        .join("");
    if (
      node.type === "Identifier" &&
      constants.has(node.name as string) &&
      !seen.has(node.name as string)
    ) {
      const next = new Set(seen);
      next.add(node.name as string);
      return staticString(constants.get(node.name as string), next);
    }
    if (node.type === "BinaryExpression" && node.operator === "+") {
      const left = staticString(node.left, seen),
        right = staticString(node.right, seen);
      if (left !== undefined || right !== undefined)
        return (left ?? "") + (right ?? "");
    }
    if (node.type === "ConditionalExpression")
      return (
        staticString(node.consequent, seen) ??
        staticString(node.alternate, seen)
      );
    if (
      node.type === "CallExpression" &&
      (node.callee as { name?: unknown })?.name === "String"
    )
      return "";
  };
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    const text =
      staticString(node) ??
      (node.type === "TemplateElement"
        ? (node.value as { cooked?: unknown })?.cooked
        : undefined);
    if (typeof text === "string" && /<script\b/i.test(text))
      throw new Error(
        `Unsupported nested code string in ${label}; arbitrary string programs are not statically protected`,
      );
    if (
      typeof text === "string" &&
      /\{\{[\s\S]*?\}\}|\{%|\{#|\$\{[^}]*\}/.test(text)
    )
      throw new Error(
        `Unsupported unresolved server-template text in ${label}; render templates first or protect external static JavaScript`,
      );
    if (
      node.type === "Identifier" &&
      ["eval", "Function", "AsyncFunction", "GeneratorFunction"].includes(
        node.name as string,
      )
    )
      throw new Error(
        `Unsupported dynamic code reference in ${label}; eval and Function strings cannot be statically protected`,
      );
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      const callee = node.callee as Record<string, unknown> | undefined;
      const property = callee?.property as Record<string, unknown> | undefined;
      const name =
        callee?.type === "Identifier"
          ? callee.name
          : property?.type === "Identifier" && !callee?.computed
            ? property.name
            : staticString(property);
      if (["eval", "Function", "constructor"].includes(name as string))
        throw new Error(`Unsupported dynamic code call in ${label}`);
      const argument = (
        node.arguments as Record<string, unknown>[] | undefined
      )?.[0];
      if (
        ["setTimeout", "setInterval"].includes(name as string) &&
        argument &&
        staticString(argument) !== undefined
      )
        throw new Error(`Unsupported dynamic string timer in ${label}`);
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(tree);
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
