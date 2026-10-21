import { expect, it } from "vitest";
import { createSecurityHeaders } from "@webguard/core";
it("generates a restrictive response policy without allowing inline scripts, eval, embedding or base changes", () => {
  const headers = createSecurityHeaders();
  const csp = headers["Content-Security-Policy"]!;
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain("require-trusted-types-for 'script'");
  expect(csp).toContain("trusted-types 'none'");
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|report-uri|report-to/);
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  expect(headers["X-Frame-Options"]).toBe("DENY");
  expect(headers["Referrer-Policy"]).toBe("no-referrer");
});
it("adds only explicitly allowed origins, normalizing and deduplicating them", () => {
  const headers = createSecurityHeaders({
    allowedOrigins: {
      script: ["https://cdn.example:443", "https://cdn.example"],
      connect: ["https://api.example"],
    },
    trustedTypes: "off",
  });
  const csp = headers["Content-Security-Policy"]!;
  expect(csp).toContain("script-src 'self' https://cdn.example;");
  expect(csp).toContain("connect-src 'self' https://api.example;");
  expect(csp).not.toContain("trusted-types");
  expect(headers["Content-Security-Policy-Report-Only"]).toBeUndefined();
});
it("can observe Trusted Types violations locally without enforcing them or sending telemetry", () => {
  const headers = createSecurityHeaders({ trustedTypes: "report-only" });
  expect(headers["Content-Security-Policy"]).not.toContain("trusted-types");
  expect(headers["Content-Security-Policy-Report-Only"]).toContain(
    "require-trusted-types-for 'script'",
  );
  expect(JSON.stringify(headers)).not.toMatch(/report-uri|report-to/);
});
it.each([
  { allowedOrigins: { script: ["https://cdn.example; script-src *"] } },
  { allowedOrigins: { connect: ["javascript:alert(1)"] } },
  { allowedOrigins: { script: ["https://name:password@cdn.example"] } },
  { allowedOrigins: { script: ["https://cdn.example/path"] } },
  { allowedOrigins: { script: ["https://cdn.example?q=1"] } },
  { allowedOrigins: { script: ["https://cdn.example/#fragment"] } },
  { allowedOrigins: { script: ["https://cdn.example\r\nX-Injected: yes"] } },
  { allowedOrigins: { script: "https://cdn.example" } },
  { allowedOrigins: { unknown: ["https://cdn.example"] } },
  { trustedTypes: "automatic" },
  { trustedTypes: null },
  { allowedOrigins: null },
  { unknown: true },
  null,
])(
  "rejects malformed policy inputs rather than emitting weakened headers %j",
  (options) => {
    expect(() => createSecurityHeaders(options as never)).toThrow();
  },
);
it.each([
  "https://*",
  "https://*.example.com",
  "https://%2a.example.com",
  "https://cdn.example,other.example",
  "https://cdn.example%2cother.example",
  "https://cdn.example%3Bupgrade-insecure-requests",
  "https://cdn.example%27unsafe-eval%27",
])("rejects CSP wildcard/separator hostname %s", (value) => {
  expect(() =>
    createSecurityHeaders({ allowedOrigins: { script: [value] } }),
  ).toThrow();
});

it("rejects inherited policy options and origin maps", () => {
  for (const options of [
    Object.create({ trustedTypes: "off" }),
    Object.create({ allowedOrigins: { script: ["https://cdn.example"] } }),
    { allowedOrigins: Object.create({ script: ["https://cdn.example"] }) },
  ]) {
    expect(() => createSecurityHeaders(options)).toThrow(TypeError);
  }
});
it("never invokes policy or allowlist accessors", () => {
  let reads = 0;
  const getter = {
    get() {
      reads++;
      return undefined;
    },
  };
  const inputs = [
    Object.defineProperty({}, "trustedTypes", getter),
    Object.defineProperty({}, "allowedOrigins", getter),
    { allowedOrigins: Object.defineProperty({}, "script", getter) },
    { allowedOrigins: { script: Object.defineProperty([], "0", getter) } },
  ];
  for (const options of inputs)
    expect(() => createSecurityHeaders(options as never)).toThrow(TypeError);
  expect(reads).toBe(0);
});
it("ignores Object.prototype policy pollution and retains enforce defaults", () => {
  const names = ["trustedTypes", "allowedOrigins", "script"];
  const previous = names.map((key) =>
    Object.getOwnPropertyDescriptor(Object.prototype, key),
  );
  let headers: Record<string, string>;
  try {
    Object.defineProperties(Object.prototype, {
      trustedTypes: { configurable: true, value: "off" },
      allowedOrigins: {
        configurable: true,
        value: { script: ["https://untrusted.example"] },
      },
      script: { configurable: true, value: ["https://untrusted.example"] },
    });
    headers = createSecurityHeaders();
  } finally {
    names.forEach((key, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
      else Reflect.deleteProperty(Object.prototype, key);
    });
  }
  expect(headers!["Content-Security-Policy"]).toContain(
    "require-trusted-types-for 'script'",
  );
  expect(headers!["Content-Security-Policy"]).not.toContain(
    "untrusted.example",
  );
});
it("accepts own data on null-prototype records and explicit undefined defaults", () => {
  const allowed = Object.assign(Object.create(null), {
    script: ["https://cdn.example:443"],
    connect: undefined,
  });
  const options = Object.assign(Object.create(null), {
    allowedOrigins: allowed,
    trustedTypes: undefined,
  });
  const csp = createSecurityHeaders(options)["Content-Security-Policy"];
  expect(csp).toContain("script-src 'self' https://cdn.example;");
  expect(csp).toContain("require-trusted-types-for 'script'");
  expect(createSecurityHeaders({ allowedOrigins: undefined })).toEqual(
    createSecurityHeaders(),
  );
});
it("rejects symbol, hidden unknown, and exotic array policy fields", () => {
  const symbol = Symbol("policy");
  const inheritedArray = ["https://cdn.example"];
  Object.setPrototypeOf(inheritedArray, Object.create(Array.prototype));
  const sparseArray = new Array(1);
  const extraArray = Object.assign(["https://cdn.example"], { extra: true });
  const symbolArray = Object.assign(["https://cdn.example"], {
    [symbol]: true,
  });
  const hidden = Object.defineProperty({}, "unknown", { value: true });
  for (const options of [
    { [symbol]: true },
    hidden,
    { allowedOrigins: { [symbol]: [] } },
    { allowedOrigins: hidden },
    ...[inheritedArray, sparseArray, extraArray, symbolArray].map((script) => ({
      allowedOrigins: { script },
    })),
  ])
    expect(() => createSecurityHeaders(options as never)).toThrow(TypeError);
});
it("does not execute a supplied array iterator or inherited numeric getter", () => {
  let reads = 0;
  const iterable = ["https://cdn.example"];
  Object.defineProperty(iterable, Symbol.iterator, {
    get() {
      reads++;
      return Array.prototype[Symbol.iterator];
    },
  });
  expect(() =>
    createSecurityHeaders({ allowedOrigins: { script: iterable } }),
  ).toThrow(TypeError);
  const sparse = new Array(1);
  const previous = Object.getOwnPropertyDescriptor(Array.prototype, "0");
  let rejected = false;
  try {
    Object.defineProperty(Array.prototype, "0", {
      configurable: true,
      get() {
        reads++;
        return "https://untrusted.example";
      },
    });
    try {
      createSecurityHeaders({ allowedOrigins: { script: sparse } });
    } catch (error) {
      rejected = error instanceof TypeError;
    }
  } finally {
    if (previous) Object.defineProperty(Array.prototype, "0", previous);
    else Reflect.deleteProperty(Array.prototype, "0");
  }
  expect(rejected).toBe(true);
  expect(reads).toBe(0);
});
