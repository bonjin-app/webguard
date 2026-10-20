import { expect, it } from "vitest";
import {
  handleDemoApi,
  handleNetworkProbe,
} from "../../deployment/demo-api.mjs";
const origin = "https://webguard.uulab.co.kr";
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(origin + "/api/demo/quote", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const valid = { sku: "course", quantity: 1, claimedTotal: 9900 };
it("provides only a fixed credential-free CORS fixture for isolated network policy probes", async () => {
  const response = handleNetworkProbe(
    new Request(origin + "/api/demo/network-probe", {
      headers: { Origin: "null" },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ probe: "webguard-network-ok" });
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(
    handleNetworkProbe(
      new Request(origin + "/api/demo/network-probe", {
        method: "POST",
        body: "ignored",
      }),
    ).status,
  ).toBe(405);
});
it("recalculates prices on the server and rejects client price tampering", async () => {
  const accepted = await handleDemoApi(request(valid));
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toMatchObject({ total: 9900, accepted: true });
  const rejected = await handleDemoApi(
    request({ ...valid, claimedTotal: 100 }),
  );
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toMatchObject({ total: 9900, accepted: false });
  expect(rejected.headers.get("cache-control")).toBe("no-store");
});
it.each([
  { ...valid, sku: "unknown" },
  { ...valid, quantity: -1 },
  { ...valid, quantity: 1.5 },
  { ...valid, quantity: 6 },
  { ...valid, role: "admin" },
  { ...valid, claimedTotal: "9900" },
  null,
  [],
])("rejects invalid input %j", async (body) => {
  expect((await handleDemoApi(request(body))).status).toBe(400);
});
it("requires same-origin JSON POST without enabling CORS", async () => {
  const wrongOrigin = await handleDemoApi(
    request(valid, { Origin: "https://other.test" }),
  );
  expect(wrongOrigin.status).toBe(403);
  expect(wrongOrigin.headers.has("access-control-allow-origin")).toBe(false);
  expect(
    (await handleDemoApi(request(valid, { "Content-Type": "text/plain" })))
      .status,
  ).toBe(415);
  expect(
    (await handleDemoApi(new Request(origin + "/api/demo/quote"))).status,
  ).toBe(405);
  expect(
    (await handleDemoApi(request({ data: "x".repeat(2000) }))).status,
  ).toBe(413);
  expect(
    (
      await handleDemoApi(
        new Request(origin + "/api/demo/quote", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: "{bad",
        }),
      )
    ).status,
  ).toBe(400);
});
