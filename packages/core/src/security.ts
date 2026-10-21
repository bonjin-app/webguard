export type TrustedTypesMode = "off" | "report-only" | "enforce";
type ResourceKind = "script" | "style" | "connect" | "img" | "font" | "worker";
export interface SecurityHeadersOptions {
  /** Exact HTTP(S) origins only, without credentials, paths, query strings or fragments. */
  allowedOrigins?: Partial<Record<ResourceKind, string[]>>;
  /** Enforcement requires a compatible app. Report-only never uploads violations automatically. */
  trustedTypes?: TrustedTypesMode;
}
const resources: ResourceKind[] = [
  "script",
  "style",
  "connect",
  "img",
  "font",
  "worker",
];
/** Snapshot only declared own data; policy must never come from prototype state or getters. */
function dataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${label} must have a plain or null prototype`);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown ${label} field`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!Object.hasOwn(descriptor, "value"))
      throw new TypeError(`${label} must contain only data properties`);
    result[key] = descriptor.value;
  }
  return result;
}
function originValues(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null)
    throw new TypeError(
      `${label} must have a standard or null array prototype`,
    );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length")!
    .value as number;
  // Every position must be an own data slot. Array.from/map would execute getters,
  // custom iterators or inherited numeric slots on sparse arrays.
  if (Reflect.ownKeys(descriptors).length !== length + 1)
    throw new TypeError(`${label} must be a dense array without extra fields`);
  const result: string[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(
      descriptors,
      String(index),
    )?.value as PropertyDescriptor | undefined;
    if (!descriptor || !Object.hasOwn(descriptor, "value"))
      throw new TypeError(`${label} must contain only own data entries`);
    result.push(origin(descriptor.value));
  }
  return result;
}
function origin(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    /[\s;'"\\]/.test(value)
  )
    throw new TypeError("Allowlist values must be exact HTTP(S) origins");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new TypeError(
      "Allowlist values must be exact HTTP(S) origins without credentials or paths",
    );
  // WHATWG URL accepts hosts containing wildcard/delimiter characters, even percent-encoded ones.
  // CSP uses a different grammar; only concrete DNS/IPv4 names are emitted here.
  const exactHost =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
  if (url.hostname.length > 253 || !exactHost.test(url.hostname))
    throw new TypeError(
      "Allowlist values require an exact DNS or IPv4 hostname, without CSP tokens",
    );
  return url.origin;
}
/** Generate real HTTP response headers; never applies or weakens host policies at runtime.
 * These constrain document loading and DOM sinks, not the browser owner's developer console.
 */
export function createSecurityHeaders(
  options: SecurityHeadersOptions = {},
): Record<string, string> {
  const input = dataObject(
    options,
    ["allowedOrigins", "trustedTypes"],
    "Security header options",
  );
  const mode =
    input.trustedTypes === undefined ? "enforce" : input.trustedTypes;
  if (
    typeof mode !== "string" ||
    !["off", "report-only", "enforce"].includes(mode)
  )
    throw new TypeError("Invalid Trusted Types mode");
  const allowed = dataObject(
    input.allowedOrigins === undefined
      ? Object.create(null)
      : input.allowedOrigins,
    resources,
    "allowedOrigins",
  );
  const directives = ["default-src 'none'"];
  for (const resource of resources) {
    const origins = [
      ...new Set(originValues(allowed[resource], `allowedOrigins.${resource}`)),
    ];
    directives.push(
      `${resource}-src 'self'${origins.length ? " " + origins.join(" ") : ""}`,
    );
  }
  directives.push(
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  );
  const base = directives.join("; "),
    trusted = "require-trusted-types-for 'script'; trusted-types 'none'";
  return {
    "Content-Security-Policy":
      mode === "enforce" ? `${base}; ${trusted}` : base,
    ...(mode === "report-only"
      ? { "Content-Security-Policy-Report-Only": `${base}; ${trusted}` }
      : {}),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };
}
