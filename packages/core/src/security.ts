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
function record(value: unknown, label: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
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
  record(options, "Security header options");
  for (const key of Object.keys(options))
    if (!["allowedOrigins", "trustedTypes"].includes(key))
      throw new TypeError(`Unknown security header option: ${key}`);
  const mode =
    options.trustedTypes === undefined ? "enforce" : options.trustedTypes;
  if (
    typeof mode !== "string" ||
    !["off", "report-only", "enforce"].includes(mode)
  )
    throw new TypeError("Invalid Trusted Types mode");
  const allowed =
    options.allowedOrigins === undefined ? {} : options.allowedOrigins;
  record(allowed, "allowedOrigins");
  for (const key of Object.keys(allowed))
    if (!resources.includes(key as ResourceKind))
      throw new TypeError(`Unknown resource kind: ${key}`);
  const directives = ["default-src 'none'"];
  for (const resource of resources) {
    const values = allowed[resource];
    if (values !== undefined && !Array.isArray(values))
      throw new TypeError(`allowedOrigins.${resource} must be an array`);
    const origins = [...new Set(Array.from(values ?? [], origin))];
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
