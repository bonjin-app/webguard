import { test, expect } from "@playwright/test";
import { createSecurityHeaders } from "@webguard/core";
async function fixture(
  page: import("@playwright/test").Page,
  mode: "off" | "enforce",
) {
  await page.route("http://127.0.0.1:4174/security-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: createSecurityHeaders({ trustedTypes: mode }),
      body: '<!doctype html><html><body><h1>Security policy fixture</h1><div id="target"></div></body></html>',
    }),
  );
  await page.goto("http://127.0.0.1:4174/security-fixture");
}
test("response CSP prevents inline event-handler and unapproved external-script execution", async ({
  page,
}) => {
  let externalRequests = 0;
  await page.route("https://unapproved.example/**", (route) => {
    externalRequests++;
    return route.fulfill({
      contentType: "application/javascript",
      body: "globalThis.externalPayloadExecuted=true;",
    });
  });
  await fixture(page, "off");
  const outcome = await page.evaluate(async () => {
    const state = globalThis as typeof globalThis & {
      inlinePayloadExecuted?: boolean;
      externalPayloadExecuted?: boolean;
    };
    const image = document.createElement("img");
    image.setAttribute("onerror", "globalThis.inlinePayloadExecuted=true");
    const imageComplete = new Promise((resolve) =>
      image.addEventListener("error", () => resolve(true), { once: true }),
    );
    image.src = "/missing-policy-test.png";
    document.body.append(image);
    const script = document.createElement("script");
    const scriptComplete = new Promise((resolve) => {
      script.onerror = () => resolve(true);
      script.onload = () => resolve(false);
    });
    script.src = "https://unapproved.example/payload.js";
    document.body.append(script);
    await Promise.all([imageComplete, scriptComplete]);
    return {
      inline: state.inlinePayloadExecuted === true,
      external: state.externalPayloadExecuted === true,
    };
  });
  expect(outcome).toEqual({ inline: false, external: false });
  expect(externalRequests).toBe(0);
});
test("enforced Trusted Types rejects string-based HTML sinks where supported", async ({
  page,
}) => {
  await fixture(page, "enforce");
  const supported = await page.evaluate(() => "trustedTypes" in globalThis);
  test.skip(
    !supported,
    "This installed browser does not expose Trusted Types; no enforcement claim for it",
  );
  const outcome = await page.evaluate(() => {
    try {
      document.querySelector("#target")!.innerHTML =
        '<img src=x onerror="globalThis.payloadExecuted=true">';
      return "accepted";
    } catch (error) {
      return error instanceof TypeError ? "rejected" : String(error);
    }
  });
  expect(outcome).toBe("rejected");
  await expect(page.locator("#target")).toBeEmpty();
});
test("browser-controlled execution remains possible even under restrictive response headers", async ({
  page,
}) => {
  await fixture(page, "enforce");
  // Automation executes through the browser's debugging control plane, not a page-owned script tag.
  const value = await page.evaluate(() => {
    document.querySelector("#target")!.textContent =
      "Changed through browser-controlled execution";
    return 6 * 7;
  });
  expect(value).toBe(42);
  await expect(page.locator("#target")).toHaveText(
    "Changed through browser-controlled execution",
  );
});
