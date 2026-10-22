import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { WebGuardInstance } from "../../packages/browser/src/index";

test("Java guide direct downloads run unchanged in root and /app browser fixtures", async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto("/docs/START_JAVA.ko.html");
  const downloaded = new Map<string, Buffer>();
  let releaseDirectory: string | undefined;
  for (const name of ["webguard.global.js", "webguard-init.js"]) {
    const link = page.getByRole("link", {
      name: `${name} 다운로드`,
      exact: true,
    });
    await expect(link).toBeVisible({ timeout: 1500 });
    const href = await link.getAttribute("href");
    expect(href).toMatch(
      /^https:\/\/webguard\.uulab\.co\.kr\/downloads\/releases\/[^/]+\//,
    );
    const url = new URL(href!);
    expect(url.pathname.split("/").at(-1)).toBe(name);
    const directory = url.pathname.slice(0, url.pathname.lastIndexOf("/"));
    if (releaseDirectory) expect(directory).toBe(releaseDirectory);
    releaseDirectory = directory;
    // Follow the guide's exact pinned path on the deployment being tested.
    const response = await request.get(new URL(url.pathname, baseURL).href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain("attachment");
    expect(response.headers()["content-disposition"]).toContain(name);
    downloaded.set(name, await response.body());
  }

  const jsp = await page
    .locator("pre code")
    .filter({ hasText: "${pageContext.request.contextPath}/assets/webguard/" })
    .first()
    .innerText();
  const tags = await page.evaluate((source) => {
    const fragment = new DOMParser().parseFromString(source, "text/html");
    return [...fragment.querySelectorAll("script")].map((script) => ({
      src: script.getAttribute("src"),
      integrity: script.integrity,
      defer: script.defer,
      crossorigin: script.crossOrigin,
    }));
  }, jsp);
  expect(tags.map((tag) => tag.src)).toEqual([
    "${pageContext.request.contextPath}/assets/webguard/webguard.global.js",
    "${pageContext.request.contextPath}/assets/webguard/webguard-init.js",
  ]);
  expect(tags.every((tag) => tag.defer)).toBe(true);
  expect(tags[0]?.crossorigin).toBe("anonymous");
  expect(tags[0]?.integrity).toBe(
    "sha384-" +
      createHash("sha384")
        .update(downloaded.get("webguard.global.js")!)
        .digest("base64"),
  );

  // Browser fixture only: substitute JSP's context expression without compiling
  // Java/JSP, installing npm packages, or transforming the downloaded scripts.
  const assetRequests: string[] = [];
  const server = createServer((incoming, outgoing) => {
    const path = incoming.url ?? "";
    for (const contextPath of ["", "/app"]) {
      for (const [name, bytes] of downloaded) {
        if (path !== `${contextPath}/assets/webguard/${name}`) continue;
        assetRequests.push(path);
        outgoing.writeHead(200, { "Content-Type": "text/javascript" });
        outgoing.end(bytes);
        return;
      }
      if (path === `${contextPath}/existing-app.js`) {
        outgoing.writeHead(200, { "Content-Type": "text/javascript" });
        outgoing.end(`
          document.querySelector('#ready').textContent = window.webguard ? 'SDK ready' : 'Waiting';
          let count = 0;
          document.querySelector('#increment').addEventListener('click', () => {
            document.querySelector('#counter').textContent = String(++count);
          });
          let receipts = 0;
          document.addEventListener('keydown', event => {
            document.querySelector('#key').textContent = event.key + ':' + event.defaultPrevented + ':' + (++receipts);
          });
        `);
        return;
      }
      if (path === `${contextPath}/`) {
        outgoing.writeHead(200, {
          "Content-Type": "text/html",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'self'; object-src 'none'; base-uri 'none'",
        });
        outgoing.end(`<!doctype html><html><head>${jsp.replaceAll(
          "${pageContext.request.contextPath}",
          contextPath,
        )}<script defer src="${contextPath}/existing-app.js"></script></head><body>
          <h1 id="ready">Waiting</h1><button id="increment">Increment</button>
          <output id="counter">0</output><output id="key"></output>
        </body></html>`);
        return;
      }
    }
    outgoing.writeHead(404);
    outgoing.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const contextPath of ["", "/app"]) {
      await page.goto(`${origin}${contextPath}/`);
      await expect(page.locator("#ready")).toHaveText("SDK ready");
      await page
        .getByRole("button", { name: "Increment", exact: true })
        .click();
      await expect(page.locator("#counter")).toHaveText("1");
      await page.keyboard.press("F12");
      await expect(page.locator("#key")).toHaveText("F12:true:1");
      await page.evaluate(() => {
        const scope = window as unknown as {
          webguard: { update(options: unknown): void };
        };
        scope.webguard.update({ devtools: { blockShortcuts: false } });
      });
      await page.keyboard.press("F12");
      await expect(page.locator("#key")).toHaveText("F12:false:2");
      await page
        .getByRole("button", { name: "Increment", exact: true })
        .click();
      await expect(page.locator("#counter")).toHaveText("2");
    }
    expect(assetRequests.sort()).toEqual(
      ["", "/app"]
        .flatMap((contextPath) =>
          [...downloaded.keys()].map(
            (name) => `${contextPath}/assets/webguard/${name}`,
          ),
        )
        .sort(),
    );
  } finally {
    await page.goto("about:blank");
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      // Browsers may leave speculative TCP connections without an HTTP request.
      // close() alone waits for them even after navigating away. This server
      // belongs solely to this finished fixture; release all its connections.
      server.closeAllConnections();
    });
  }
});

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
  const initializer = await request.get(current.example.url);
  expect(initializer.ok()).toBe(true);
  const initializationCode = await initializer.text();

  // Use an actual second origin so Chromium can classify its loopback address space.
  const server = createServer((incoming, outgoing) => {
    if (incoming.url === "/init.js") {
      outgoing.writeHead(200, { "Content-Type": "text/javascript" });
      outgoing.end(initializationCode);
    } else if (incoming.url === "/consumer.js") {
      outgoing.writeHead(200, { "Content-Type": "text/javascript" });
      outgoing.end(
        `if (window.webguard) document.querySelector('#ready').textContent='SDK ready'; document.addEventListener('keydown', event => { document.querySelector('#key').textContent=String(event.defaultPrevented); });`,
      );
    } else {
      outgoing.writeHead(200, {
        "Content-Type": "text/html",
        "Content-Security-Policy": `default-src 'none'; script-src 'self' ${new URL(sdkUrl).origin}; object-src 'none'; base-uri 'none'`,
      });
      outgoing.end(
        `<h1 id="ready">Waiting</h1><output id="key"></output><script defer src="${sdkUrl}" integrity="${current.sdk.integrity}" crossorigin="anonymous"></script><script defer src="/init.js"></script><script defer src="/consumer.js"></script>`,
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
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { webguard: WebGuardInstance }
        ).webguard.getStatus(),
      ),
    ).toMatchObject({
      lifecycle: "active",
      features: { shortcuts: "listening" },
      coverage: { obfuscation: "not-verified" },
    });
    for (const shortcut of ["F12", "Meta+Alt+i", "Control+Shift+j"]) {
      await page.keyboard.press(shortcut);
      await expect(page.locator("#key")).toHaveText("true");
    }
    // Native lifecycle events with persisted=true must preserve this published initializer's instance.
    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    await page.keyboard.press("F12");
    await expect(page.locator("#key")).toHaveText("true");
    await page.evaluate(() => {
      const scope = window as unknown as {
        webguard: { update(options: unknown): void };
      };
      scope.webguard.update({ devtools: { blockShortcuts: false } });
    });
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { webguard: WebGuardInstance }
          ).webguard.getStatus().features.shortcuts,
      ),
    ).toBe("off");
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
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      // Browsers may leave speculative TCP connections without an HTTP request.
      // close() alone waits for them even after navigating away. This server
      // belongs solely to this finished fixture; release all its connections.
      server.closeAllConnections();
    });
  }
});
