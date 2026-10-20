import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { verifyDeployment } from "../../packages/cli/src/remote";

test("public demo serves each application with its intended headers and rejects nonpublic files", async ({
  request,
}) => {
  for (const [path, strict] of [
    ["/", false],
    ["/docs/", false],
    ["/examples/react/", true],
    ["/examples/vanilla-js/", true],
    ["/examples/vanilla-ts/", true],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("object-src 'none'");
    expect(csp.includes("require-trusted-types-for 'script'"), path).toBe(
      strict,
    );
  }
  for (const path of [
    "/unknown-route",
    "/.env",
    "/package.json",
    "/deployment/worker.ts",
    "/webguard-report.json",
    "/webguard-headers.json",
    "/examples/react/webguard-report.json",
    "/examples/react/webguard-headers.json",
    "/examples/react/_headers",
    "/examples/react/src/main.tsx",
    "/assets/not-real.js.map",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});
test("deployed application bytes match trusted local manifests and source probes return absent", async ({
  baseURL,
}) => {
  for (const [name, path] of [
    ["react", "/examples/react/"],
    ["vanilla-js", "/examples/vanilla-js/"],
    ["vanilla-ts", "/examples/vanilla-ts/"],
  ]) {
    const manifest = JSON.parse(
      await readFile(`.demo-dist/${name}/webguard-manifest.json`, "utf8"),
    );
    const result = await verifyDeployment(
      new URL(path!, baseURL).href,
      manifest,
    );
    expect(result, name).toMatchObject({ valid: true, errors: [] });
  }
});
