import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium, firefox, webkit } from "@playwright/test";

const base = new URL(process.argv[2]);
if (base.hostname !== "127.0.0.1" || base.protocol !== "http:")
  throw new Error(
    "JSP browser verification only accepts the local test server",
  );
const receipt = {
  checkedAt: new Date().toISOString(),
  runtime: "Java 17 / embedded Tomcat 10.1.61",
  engines: [],
};
for (const engine of [chromium, firefox, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base.href);
    await page.getByRole("button", { name: "Call Servlet" }).click();
    await page.getByText("Servlet: ok, answer 42", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() =>
        Boolean(globalThis.WebGuardSDK?.getAutoGuard()),
      ),
      true,
    );
    // Capture a trusted event delivered to the page; this does not test the browser menu.
    await page.evaluate(() => {
      document.addEventListener(
        "keydown",
        (event) => {
          globalThis.keyReceipt = {
            trusted: event.isTrusted,
            prevented: event.defaultPrevented,
          };
        },
        { once: true },
      );
    });
    await page.keyboard.press("F12");
    assert.deepEqual(await page.evaluate(() => globalThis.keyReceipt), {
      trusted: true,
      prevented: true,
    });
    assert.deepEqual(errors, []);
    receipt.engines.push({
      engine: engine.name(),
      serverApi: true,
      sdk: true,
      trustedShortcut: true,
      pageErrors: errors,
    });
  } finally {
    await browser.close();
  }
}
await writeFile(
  new URL("../docs/evidence/jsp-ssr-browser.json", import.meta.url),
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log("JSP SSR: 3 browser engines passed");
