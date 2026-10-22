import { test, expect } from "@playwright/test";
import { checkDeployment } from "../../packages/cli/src/check";

test("public network-policy fixture returns a fixed credential-free response only", async ({
  request,
}) => {
  const response = await request.get("/api/demo/network-probe", {
    headers: { Origin: "null" },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ probe: "webguard-network-ok" });
  expect(response.headers()["access-control-allow-origin"]).toBe("*");
  expect(
    response.headers()["access-control-allow-credentials"],
  ).toBeUndefined();
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect((await request.post("/api/demo/network-probe")).status()).toBe(405);
  expect((await request.get("/api/demo/network-probe/private")).status()).toBe(
    404,
  );
});

test("branded demo entry preserves its canonical address, assets and safe redirects", async ({
  request,
  baseURL,
}) => {
  const demo = await request.get("/demo");
  const index = await request.get("/index.html");
  expect(demo.status()).toBe(200);
  expect(await demo.body()).toEqual(await index.body());
  expect(await demo.text()).toContain(
    'href="https://webguard.uulab.co.kr/demo"',
  );
  const slash = await request.get("/demo/?example=hello", { maxRedirects: 0 });
  expect(slash.status()).toBe(308);
  expect(slash.headers().location).toBe("/demo?example=hello");
  const root = await request.get("/?example=hello", { maxRedirects: 0 });
  if (new URL(baseURL!).hostname === "webguard.uulab.co.kr") {
    expect(root.status()).toBe(307);
    expect(root.headers().location).toBe("/demo?example=hello");
  } else expect(root.status()).toBe(200);
  expect((await request.head("/demo")).status()).toBe(200);
  expect((await request.post("/demo")).status()).toBe(405);
  for (const path of [
    "/demo/private",
    "/demo/webguard-report.json",
    "/demo%2f",
    "/demo//",
  ])
    expect((await request.get(path)).status(), path).toBe(404);
});

test("public demo serves each application with its intended headers and rejects nonpublic files", async ({
  request,
}) => {
  for (const [path, strict] of [
    ["/", false],
    ["/docs/", false],
    ["/examples/react/", true],
    ["/examples/vanilla-js/", true],
    ["/examples/vanilla-js/about/", true],
    ["/examples/vanilla-ts/", true],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toBe(
      "text/html; charset=utf-8",
    );
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
test("denies compressed siblings of the deployed entry and private reports", async ({
  request,
}) => {
  const entry = await request.get("/demo");
  const asset = /src="(\/assets\/[^"\s]+\.js)"/.exec(await entry.text())?.[1];
  expect(asset).toBeTruthy();
  for (const path of [asset!, `${asset}.map`, "/webguard-report.json"])
    for (const suffix of [".gz", ".br", ".gz.gz", ".gz.br", ".br.gz", ".br.br"])
      expect((await request.get(path + suffix)).status(), path + suffix).toBe(
        404,
      );
});

test("deployment checker verifies trusted bytes, actual policies and private URL absence", async ({
  baseURL,
}) => {
  for (const [name, path] of [
    ["react", "/examples/react/"],
    ["vanilla-js", "/examples/vanilla-js/"],
    ["vanilla-ts", "/examples/vanilla-ts/"],
  ]) {
    const result = await checkDeployment(
      `.demo-dist/${name}`,
      new URL(path!, baseURL).href,
    );
    expect(result, name).toMatchObject({ valid: true, errors: [] });
  }
});

test("public demo API rejects tampered prices and cross-origin or malformed input", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const send = (claimedTotal: number, originHeader = origin) =>
    request.post("/api/demo/quote", {
      headers: { Origin: originHeader },
      data: { sku: "course", quantity: 1, claimedTotal },
    });
  const normal = await send(9900);
  expect(normal.status()).toBe(200);
  expect(await normal.json()).toMatchObject({ accepted: true, total: 9900 });
  const tampered = await send(100);
  expect(tampered.status()).toBe(409);
  expect(await tampered.json()).toMatchObject({ accepted: false, total: 9900 });
  expect(tampered.headers()["cache-control"]).toBe("no-store");
  expect((await send(100, "https://other.test")).status()).toBe(403);
  expect(
    (
      await request.post("/api/demo/quote", {
        headers: { Origin: origin },
        data: { sku: "course", quantity: 1, claimedTotal: 9900, role: "admin" },
      })
    ).status(),
  ).toBe(400);
  expect((await request.get("/api/demo/quote")).status()).toBe(405);
});
