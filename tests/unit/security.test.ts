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
