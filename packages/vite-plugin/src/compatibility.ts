import { isAbsolute, relative, sep } from "node:path";
import { parse, type Node } from "acorn";
import type { Plugin } from "vite";

type SyntaxNode = Node & Record<string, unknown>;
function node(value: unknown): value is SyntaxNode {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Node).type === "string"
  );
}
function memberName(value: unknown): string | undefined {
  if (
    !node(value) ||
    value.type !== "MemberExpression" ||
    !node(value.property)
  )
    return;
  if (!value.computed && value.property.type === "Identifier")
    return value.property.name as string;
  if (
    value.computed &&
    value.property.type === "Literal" &&
    typeof value.property.value === "string"
  )
    return value.property.value;
}
function isDocument(value: unknown): boolean {
  if (!node(value)) return false;
  if (value.type === "Identifier") return value.name === "document";
  return (
    memberName(value) === "document" &&
    node(value.object) &&
    value.object.type === "Identifier" &&
    ["window", "globalThis"].includes(value.object.name as string)
  );
}

/** Advisory syntax scan, not data flow analysis: values may already be TrustedHTML.
 * Covers named/static-computed HTML assignments and calls. Aliases, dynamic keys,
 * framework templates, dependency code and other Trusted Types sinks are not audited.
 */
export function trustedTypesCompatibility(enabled: boolean): Plugin {
  let root = "";
  return {
    name: "webguard-trusted-types-compatibility",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      root = config.root;
    },
    transform(source, id) {
      if (!enabled || id.includes("\0")) return;
      const filename = id.split("?")[0]!;
      const local = relative(root, filename);
      if (
        !isAbsolute(filename) ||
        local === ".." ||
        local.startsWith(`..${sep}`) ||
        isAbsolute(local) ||
        filename.replaceAll("\\", "/").includes("/node_modules/") ||
        !/\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(filename)
      )
        return;
      let tree: Node;
      try {
        tree = parse(source, {
          ecmaVersion: "latest",
          sourceType: "module",
          allowHashBang: true,
        });
      } catch (error) {
        // Diagnostics must not reject syntax supported by another Vite transform.
        if (error instanceof SyntaxError) return;
        throw error;
      }
      const sinks = new Set<string>();
      const visit = (current: SyntaxNode): void => {
        if (current.type === "AssignmentExpression") {
          const name = memberName(current.left);
          if (name === "innerHTML" || name === "outerHTML") sinks.add(name);
        }
        if (current.type === "CallExpression") {
          const name = memberName(current.callee);
          if (name === "insertAdjacentHTML") sinks.add(name);
          if (
            (name === "write" || name === "writeln") &&
            node(current.callee) &&
            isDocument(current.callee.object)
          )
            sinks.add(`document.${name}`);
        }
        for (const value of Object.values(current)) {
          if (node(value)) visit(value);
          else if (Array.isArray(value))
            for (const item of value) if (node(item)) visit(item);
        }
      };
      visit(tree as SyntaxNode);
      if (sinks.size)
        this.warn({
          code: "WG_TRUSTED_TYPES_SINK",
          id: local.split(sep).join("/"),
          message: `[WG_TRUSTED_TYPES_SINK] ${local.split(sep).join("/")}: ${[...sinks].sort().join(", ")} has potential runtime incompatibility with enforced Trusted Types. Prefer safe DOM APIs (textContent, createElement); review values and policies, or explicitly select headers.trustedTypes: 'report-only' for compatibility. This syntax diagnostic does not prove that a sink executes or receives an untrusted string.`,
        });
    },
  };
}
