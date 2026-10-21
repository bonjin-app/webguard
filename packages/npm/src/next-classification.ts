import type { Preset } from "@webguard/core";

export interface ModuleOrigin {
  resource?: unknown;
  modules?: Iterable<ModuleOrigin>;
}

/** Unknown/generated modules and dependency trees containing application code
 * stay at the requested tier. Never classify from a chunk's output filename. */
export function isPureFrameworkChunk(
  modules: Iterable<ModuleOrigin>,
  context: string,
): boolean {
  const active = new Set<ModuleOrigin>();
  const memo = new Map<ModuleOrigin, boolean>();
  const root = context.replaceAll("\\", "/").replace(/\/$/, "");
  const framework = (module: ModuleOrigin): boolean => {
    if (!module || typeof module !== "object" || active.has(module))
      return false;
    const previous = memo.get(module);
    if (previous !== undefined) return previous;
    active.add(module);
    let value = false;
    try {
      if (module.modules) {
        const nested = [...module.modules];
        value = nested.length > 0 && nested.every(framework);
      } else if (typeof module.resource === "string") {
        const resource = module.resource
          .replaceAll("\\", "/")
          .split(/[?#]/)[0]!;
        const absolute =
          resource.startsWith("/") || /^[a-z]:\//i.test(resource);
        const own =
          resource.startsWith(root + "/") &&
          !resource.startsWith(root + "/node_modules/");
        const sdk =
          /\/node_modules\/(?:uulab-webguard|@webguard\/[^/]+)(?:\/|$)/.test(
            resource,
          );
        value =
          absolute &&
          !own &&
          !sdk &&
          /\/node_modules\//.test(resource) &&
          !resource.includes("!");
      }
    } catch {
      /* An uninspectable module is application/unknown, never lowered. */
    }
    active.delete(module);
    memo.set(module, value);
    return value;
  };
  try {
    const origins = [...modules];
    return origins.length > 0 && origins.every(framework);
  } catch {
    return false;
  }
}

export function chunkPreset(
  requested: Preset,
  pureFramework: boolean,
  frameworkPreset: "standard" | "inherit",
): Preset {
  return pureFramework && frameworkPreset !== "inherit" && requested !== "basic"
    ? "standard"
    : requested;
}
