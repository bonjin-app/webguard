export type Preset = "basic" | "standard" | "strict" | "custom";
export type ObfuscationLevel = "basic" | "standard" | "high";
export type StringArrayEncoding = "none" | "base64" | "rc4";

export interface ObfuscationConfig {
  enabled: boolean;
  level: ObfuscationLevel;
  stringArrayEncoding: StringArrayEncoding;
  /** Globs match built output paths, never source TypeScript or JSX paths. */
  include: string[];
  exclude: string[];
  /** Regular expressions matching identifiers that must retain their names. */
  reservedNames: string[];
  /** Regular expressions matching public properties that must retain their names. */
  reservedProperties: string[];
  renameProperties: boolean;
  deadCodeInjection: boolean;
  seed: number;
}
export interface SourceMapsConfig {
  public: false;
  privateArtifacts: boolean;
}
export interface IntegrityConfig {
  enabled: boolean;
  generateManifest: boolean;
}
export interface WebGuardConfigInput {
  preset?: Preset;
  obfuscation?: Partial<ObfuscationConfig>;
  sourceMaps?: Partial<SourceMapsConfig>;
  integrity?: Partial<IntegrityConfig>;
}
export interface WebGuardConfig {
  preset: Preset;
  obfuscation: ObfuscationConfig;
  sourceMaps: SourceMapsConfig;
  integrity: IntegrityConfig;
}

export type ResolvedConfig = WebGuardConfig;

function object(value: unknown, path: string, keys: string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${path} must be an object`);
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      throw new TypeError(`Unknown ${path} option: ${key}`);
}
function boolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "boolean")
    throw new TypeError(`${path} must be a boolean`);
}

/** Resolve presets without mutating caller-owned values or sharing mutable defaults. */
export function resolveConfig(input: WebGuardConfigInput = {}): WebGuardConfig {
  object(input, "config", ["preset", "obfuscation", "sourceMaps", "integrity"]);
  const preset = input.preset === undefined ? "standard" : input.preset;
  if (!["basic", "standard", "strict", "custom"].includes(preset))
    throw new TypeError("Unknown preset");
  const effectiveLevel =
    input.obfuscation?.level ??
    (preset === "basic" ? "basic" : preset === "strict" ? "high" : "standard");
  const defaults: ObfuscationConfig = {
    enabled: true,
    stringArrayEncoding: effectiveLevel === "high" ? "rc4" : "none",
    level:
      preset === "basic" ? "basic" : preset === "strict" ? "high" : "standard",
    include: ["**/*.{js,mjs,cjs}"],
    exclude: ["**/node_modules/**", "**/*.test.*", "**/*.spec.*"],
    reservedNames: [],
    reservedProperties: [],
    renameProperties: false,
    deadCodeInjection: false,
    seed: 0,
  };
  const options = input.obfuscation;
  if (options !== undefined) {
    object(options, "obfuscation", Object.keys(defaults));
    for (const key of [
      "enabled",
      "renameProperties",
      "deadCodeInjection",
    ] as const)
      boolean(options[key], `obfuscation.${key}`);
    if (
      options.level !== undefined &&
      !["basic", "standard", "high"].includes(options.level)
    )
      throw new TypeError("Invalid obfuscation level");
    if (
      options.stringArrayEncoding !== undefined &&
      !["none", "base64", "rc4"].includes(options.stringArrayEncoding)
    )
      throw new TypeError("Invalid string-array encoding");
    if (
      options.seed !== undefined &&
      (!Number.isSafeInteger(options.seed) || options.seed < 0)
    )
      throw new TypeError("seed must be a non-negative safe integer");
    for (const key of [
      "include",
      "exclude",
      "reservedNames",
      "reservedProperties",
    ] as const) {
      const entries = options[key];
      if (entries !== undefined) {
        if (
          !Array.isArray(entries) ||
          entries.some((entry) => typeof entry !== "string" || !entry.trim())
        )
          throw new TypeError(`${key} must be an array of non-empty strings`);
        if (key === "reservedNames" || key === "reservedProperties")
          for (const expression of entries) new RegExp(expression);
      }
    }
  }
  const obfuscation = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof ObfuscationConfig)[]) {
    const value = options?.[key];
    if (value !== undefined) Object.assign(obfuscation, { [key]: value });
  }
  for (const key of [
    "include",
    "exclude",
    "reservedNames",
    "reservedProperties",
  ] as const)
    obfuscation[key] = [...obfuscation[key]];
  if (
    obfuscation.level === "basic" &&
    (obfuscation.renameProperties ||
      obfuscation.deadCodeInjection ||
      obfuscation.stringArrayEncoding !== "none")
  ) {
    throw new TypeError(
      "Basic obfuscation supports minification and identifier renaming only",
    );
  }
  if (obfuscation.renameProperties && !obfuscation.reservedProperties.length)
    throw new TypeError(
      "Property renaming requires explicit reservedProperties for the public API",
    );
  const sourceMaps: SourceMapsConfig = {
    public: false,
    privateArtifacts: false,
  };
  if (input.sourceMaps !== undefined) {
    object(input.sourceMaps, "sourceMaps", ["public", "privateArtifacts"]);
    if (
      input.sourceMaps.public !== undefined &&
      input.sourceMaps.public !== false
    )
      throw new TypeError("Public source maps are forbidden");
    boolean(input.sourceMaps.privateArtifacts, "sourceMaps.privateArtifacts");
    sourceMaps.privateArtifacts = input.sourceMaps.privateArtifacts ?? false;
  }
  const integrity: IntegrityConfig = {
    enabled: preset !== "basic",
    generateManifest: preset !== "basic",
  };
  if (input.integrity !== undefined) {
    object(input.integrity, "integrity", ["enabled", "generateManifest"]);
    for (const key of ["enabled", "generateManifest"] as const) {
      boolean(input.integrity[key], `integrity.${key}`);
      integrity[key] = input.integrity[key] ?? integrity[key];
    }
  }
  return { preset, obfuscation, sourceMaps, integrity };
}

/** Type-preserving configuration helper; runtime validation happens at resolution. */
export function defineConfig<const T extends WebGuardConfigInput>(input: T): T {
  return input;
}

export {
  createSecurityHeaders,
  type SecurityHeadersOptions,
  type TrustedTypesMode,
} from "./security.js";
