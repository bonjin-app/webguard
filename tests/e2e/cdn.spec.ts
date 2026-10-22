import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

test("loads the pinned CDN SDK with SRI across origins and rejects changed bytes", async ({
  page,
  request,
  baseURL,
}) => {
  const response = await request.get("/downloads/catalog.json");
  expect(response.ok()).toBe(true);
  const { current } = await response.json();
  const sdkUrl = new URL(current.sdk.url, baseURL).href;
  const sdk = await request.get(sdkUrl);
  expect(sdk.headers()["access-control-allow-origin"]).toBe("*");
  expect(sdk.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
  const bytes = await sdk.body();
  expect("sha384-" + createHash("sha384").update(bytes).digest("base64")).toBe(
    current.sdk.integrity,
  );
  expect(bytes.toString()).not.toContain("sourceMappingURL");
  const attachment = await request.get(current.sdk.download);
  expect(await attachment.body()).toEqual(bytes);
  expect(attachment.headers()["content-disposition"]).toContain("attachment");
  expect(
    (await request.head(current.package.url)).headers()["content-type"],
  ).toBe("application/gzip");

  // Use an actual second origin so Chromium can classify its loopback address space.
  const server = createServer((incoming, outgoing) => {
    if (incoming.url === "/init.js") {
      outgoing.writeHead(200, { "Content-Type": "text/javascript" });
      outgoing.end(
        `window.guard = WebGuardSDK.WebGuard.init({devtools:{blockShortcuts:true,shortcutScope:'page',detect:false,response:'monitor'}}); document.querySelector('#ready').textContent='SDK ready'; document.addEventListener('keydown', event => { document.querySelector('#key').textContent=String(event.defaultPrevented); });`,
      );
    } else {
      outgoing.writeHead(200, {
        "Content-Type": "text/html",
        "Content-Security-Policy": `default-src 'none'; script-src 'self' ${new URL(sdkUrl).origin}; object-src 'none'; base-uri 'none'`,
      });
      outgoing.end(
        `<h1 id="ready">Waiting</h1><output id="key"></output><script defer src="${sdkUrl}" integrity="${current.sdk.integrity}" crossorigin="anonymous"></script><script defer src="/init.js"></script>`,
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const consumerOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await page.goto(consumerOrigin + "/");
    await expect(page.locator("#ready")).toHaveText("SDK ready");
    for (const shortcut of ["F12", "Meta+Alt+i", "Control+Shift+j"]) {
      await page.keyboard.press(shortcut);
      await expect(page.locator("#key")).toHaveText("true");
    }
    await page.evaluate(() => {
      const scope = window as unknown as {
        guard: { update(options: unknown): void };
      };
      scope.guard.update({ devtools: { blockShortcuts: false } });
    });
    for (const shortcut of ["F12", "Meta+Alt+i", "Control+Shift+j"]) {
      await page.keyboard.press(shortcut);
      await expect(page.locator("#key")).toHaveText("false");
    }

    // Keep cross-origin policy; replace transport metadata because the response body changes.
    const tamperedHeaders = Object.fromEntries(
      Object.entries(sdk.headers()).filter(
        ([name]) =>
          !["content-length", "content-encoding", "transfer-encoding"].includes(
            name,
          ),
      ),
    );
    await page.route(sdkUrl, (route) =>
      route.fulfill({
        body: Buffer.concat([bytes, Buffer.from("\n/* altered */")]),
        headers: tamperedHeaders,
        status: 200,
      }),
    );
    await page.goto(consumerOrigin + "/");
    await expect(page.locator("#ready")).toHaveText("Waiting");
    expect(
      await page.evaluate(
        () =>
          typeof (window as unknown as { WebGuardSDK?: unknown }).WebGuardSDK,
      ),
    ).toBe("undefined");
  } finally {
    await page.goto("about:blank");
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
