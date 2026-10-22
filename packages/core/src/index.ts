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

/** Read only declared own data; inherited policy and getters are not configuration. */
function object(
  value: unknown,
  path: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${path} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${path} must have a plain or null prototype`);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown ${path} option`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!Object.hasOwn(descriptor, "value"))
      throw new TypeError(`${path} must contain only data properties`);
    result[key] = descriptor.value;
  }
  return result;
}
function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value))
    throw new TypeError(`${path} must be an array of non-empty strings`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null)
    throw new TypeError(`${path} must have a standard or null array prototype`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length")!
    .value as number;
  if (Reflect.ownKeys(descriptors).length !== length + 1)
    throw new TypeError(`${path} must be a dense array without extra fields`);
  const result: string[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(
      descriptors,
      String(index),
    )?.value as PropertyDescriptor | undefined;
    if (
      !descriptor ||
      !Object.hasOwn(descriptor, "value") ||
      typeof descriptor.value !== "string" ||
      !descriptor.value.trim()
    )
      throw new TypeError(
        `${path} must contain only own non-empty string data`,
      );
    result.push(descriptor.value);
  }
  return result;
}
function boolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "boolean")
    throw new TypeError(`${path} must be a boolean`);
}

/** Resolve presets without mutating caller-owned values or sharing mutable defaults. */
export function resolveConfig(input: WebGuardConfigInput = {}): WebGuardConfig {
  const config = object(input, "config", [
    "preset",
    "obfuscation",
    "sourceMaps",
    "integrity",
  ]);
  const preset = (
    config.preset === undefined ? "standard" : config.preset
  ) as Preset;
  if (!["basic", "standard", "strict", "custom"].includes(preset))
    throw new TypeError("Unknown preset");
  const defaults: ObfuscationConfig = {
    enabled: true,
    stringArrayEncoding: "none",
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
  const options =
    config.obfuscation === undefined
      ? undefined
      : object(config.obfuscation, "obfuscation", Object.keys(defaults));
  const effectiveLevel = options?.level ?? defaults.level;
  defaults.stringArrayEncoding = effectiveLevel === "high" ? "rc4" : "none";
  if (options !== undefined) {
    for (const key of [
      "enabled",
      "renameProperties",
      "deadCodeInjection",
    ] as const)
      boolean(options[key], `obfuscation.${key}`);
    if (
      options.level !== undefined &&
      !["basic", "standard", "high"].includes(options.level as string)
    )
      throw new TypeError("Invalid obfuscation level");
    if (
      options.stringArrayEncoding !== undefined &&
      !["none", "base64", "rc4"].includes(options.stringArrayEncoding as string)
    )
      throw new TypeError("Invalid string-array encoding");
    if (
      options.seed !== undefined &&
      (typeof options.seed !== "number" ||
        !Number.isSafeInteger(options.seed) ||
        options.seed < 0)
    )
      throw new TypeError("seed must be a non-negative safe integer");
    for (const key of [
      "include",
      "exclude",
      "reservedNames",
      "reservedProperties",
    ] as const) {
      if (options[key] !== undefined) {
        const entries = strings(options[key], key);
        if (key === "reservedNames" || key === "reservedProperties")
          for (const expression of entries) new RegExp(expression);
        options[key] = entries;
      }
    }
  }
  const obfuscation = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof ObfuscationConfig)[]) {
    const value = options?.[key];
    if (value !== undefined) Object.assign(obfuscation, { [key]: value });
  }
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
  if (config.sourceMaps !== undefined) {
    const maps = object(config.sourceMaps, "sourceMaps", [
      "public",
      "privateArtifacts",
    ]);
    if (maps.public !== undefined && maps.public !== false)
      throw new TypeError("Public source maps are forbidden");
    boolean(maps.privateArtifacts, "sourceMaps.privateArtifacts");
    sourceMaps.privateArtifacts = maps.privateArtifacts === true;
  }
  const integrity: IntegrityConfig = {
    enabled: preset !== "basic",
    generateManifest: preset !== "basic",
  };
  if (config.integrity !== undefined) {
    const overrides = object(config.integrity, "integrity", [
      "enabled",
      "generateManifest",
    ]);
    for (const key of ["enabled", "generateManifest"] as const) {
      const value = overrides[key];
      boolean(value, `integrity.${key}`);
      if (typeof value === "boolean") integrity[key] = value;
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
