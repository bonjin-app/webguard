import { expect, it } from "vitest";
import { integrations } from "../../apps/playground/src/examples";

it("offers a Next client-only setup rather than routing SSR developers through Vite", () => {
  const next = integrations.find((item) => String(item.id) === "next");
  expect(next).toBeDefined();
  expect(next?.code).toContain("from 'uulab-webguard/next'");
  expect(next?.code).toContain("withWebGuard(");
  expect(next?.code).toContain("next build --webpack");
  expect(next?.code).not.toContain("webguard protect-app .next");
  expect(next?.hint).toContain("클라이언트");
  expect(next?.hint).toContain("CSP");
});
