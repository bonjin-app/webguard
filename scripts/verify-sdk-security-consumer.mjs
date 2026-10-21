import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, firefox, webkit } from "@playwright/test";

const args = process.argv.slice(2);
if (!args.includes("--tarball"))
  throw Error("Use --tarball PATH --evidence PATH");
const tarball = resolve(args[args.indexOf("--tarball") + 1]);
const evidence = resolve(args[args.indexOf("--evidence") + 1]);
const root = await mkdtemp(join(tmpdir(), "webguard-security-consumer-"));
const run = promisify(execFile);
const expected =
  "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn";
const report = {
  checkedAt: new Date().toISOString(),
  method:
    "Fresh installed candidate classic SDK in ephemeral native browser contexts; actual local HTTP requests with dummy cookies and query-only fixture data",
  sha512: createHash("sha512")
    .update(await readFile(tarball))
    .digest("hex"),
  publish: false,
  cases: [],
};
let server;
try {
  await writeFile(
    join(root, "package.json"),
    '{"private":true,"type":"module"}',
  );
  await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    { cwd: root, timeout: 180000 },
  );
  const sdk = await readFile(
    join(root, "node_modules/uulab-webguard/dist/browser.global.js"),
  );
  const requests = [];
  server = createServer((request, response) => {
    const path = new URL(request.url, "http://fixture.test").pathname;
    const receipt = {
      path,
      cookie: request.headers.cookie,
      referer: request.headers.referer,
      closed: false,
    };
    requests.push(receipt);
    response.on("close", () => {
      receipt.closed = true;
    });
    if (path === "/private") {
      // No Referrer-Policy header: SDK privacy must be effective on its own.
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": "session=fixture-only; SameSite=Strict; Path=/",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'",
      });
      response.end(
        '<!doctype html><html><body><p id="status">Starting</p><script src="/sdk.js"></script><script src="/init.js"></script></body></html>',
      );
    } else if (path === "/sdk.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(sdk);
    } else if (path === "/init.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(
        "globalThis.events=[];globalThis.guard=WebGuardSDK.WebGuard.init({integrity:{enabled:true,timeoutMs:1000,maxBytes:64,maxConcurrent:1},onThreat:event=>events.push(event.type)});document.querySelector('#status').textContent='Ready';",
      );
    } else if (path === "/asset" || path === "/control") response.end("abc");
    else if (path === "/redirect" || path === "/redirect-control") {
      response.writeHead(302, { Location: "/asset" });
      response.end();
    } else if (path === "/gzip" || path === "/gzip-small") {
      const zipped = gzipSync(
        path === "/gzip-small" ? "abc" : "a".repeat(1024),
      );
      response.writeHead(200, {
        "Content-Encoding": "gzip",
        "Content-Length": zipped.length,
      });
      response.end(zipped);
    } else if (path === "/chunks") {
      response.writeHead(200);
      response.write("abc");
    } else if (path === "/pending") {
      /* Intentionally wait for client cancellation. */
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [engine, launcher] of Object.entries({
    chromium,
    firefox,
    webkit,
  })) {
    const browser = await launcher.launch();
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base + "/private?ticket=fixture-only");
      await page.locator("#status").filter({ hasText: "Ready" }).waitFor();
      await page.evaluate(() => {
        globalThis.domFailures = [];
        globalThis.addEventListener("unhandledrejection", () =>
          globalThis.domFailures.push("unhandledrejection"),
        );
        globalThis.addEventListener("error", () =>
          globalThis.domFailures.push("error"),
        );
      });
      const redirectControl = await page.evaluate(async () => {
        try {
          await fetch("/redirect-control", { redirect: "error" });
          return false;
        } catch {
          return true;
        }
      });
      assert.equal(redirectControl, true);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const baselineNativeRedirectDiagnostic = errors.some((message) =>
        message.endsWith(
          new URL(base).host +
            "/redirect-control due to access control checks.",
        ),
      );
      assert.deepEqual(await page.evaluate(() => globalThis.domFailures), []);
      await page.evaluate(() => fetch("/control"));
      const control = requests.filter((r) => r.path === "/control").at(-1);
      assert.equal(control.cookie, "session=fixture-only");
      assert.equal(control.referer, base + "/private?ticket=fixture-only");
      assert.equal(
        await page.evaluate(
          (hash) => globalThis.guard.checkIntegrity("/asset", hash),
          expected,
        ),
        true,
      );
      const asset = requests.filter((r) => r.path === "/asset").at(-1);
      assert.equal(asset.cookie, undefined);
      assert.equal(asset.referer, undefined);
      report.cases.push({
        engine,
        case: "credential-and-referrer-free-verification",
        normalFetchSentDummyCookieAndQuery: true,
        sdkSentNeither: true,
        exactDigest: true,
      });

      const beforeRedirect = requests.filter((r) => r.path === "/asset").length;
      assert.equal(
        await page.evaluate(
          (hash) => globalThis.guard.checkIntegrity("/redirect", hash),
          expected,
        ),
        false,
      );
      assert.equal(
        requests.filter((r) => r.path === "/asset").length,
        beforeRedirect,
      );
      assert.equal(
        await page.evaluate(
          (hash) =>
            globalThis.guard.checkIntegrity("data:text/plain,abc", hash),
          expected,
        ),
        false,
      );
      report.cases.push({
        engine,
        case: "resource-scope",
        redirectNotFollowed: true,
        nonHttpRejected: true,
      });

      await page.evaluate(() => {
        globalThis.events = [];
        globalThis.guard.update({ integrity: { maxBytes: 3 } });
      });
      assert.equal(
        await page.evaluate(
          (hash) => globalThis.guard.checkIntegrity("/gzip-small", hash),
          expected,
        ),
        true,
      );
      await page.evaluate(() =>
        globalThis.guard.update({ integrity: { maxBytes: 64 } }),
      );
      assert.equal(
        await page.evaluate(
          (hash) => globalThis.guard.checkIntegrity("/gzip", hash),
          expected,
        ),
        false,
      );
      assert.deepEqual(await page.evaluate(() => globalThis.events), [
        "integrity-error",
      ]);
      report.cases.push({
        engine,
        case: "decoded-byte-budget",
        compressedExactBoundaryAccepted: true,
        decompressionOverflowRejected: true,
      });

      await page.evaluate(() =>
        globalThis.guard.update({ integrity: { timeoutMs: 300 } }),
      );
      assert.equal(
        await page.evaluate(
          (hash) => globalThis.guard.checkIntegrity("/chunks", hash),
          expected,
        ),
        false,
      );
      const streamed = requests.filter((r) => r.path === "/chunks").at(-1);
      await assertEventually(() => streamed.closed);
      assert.equal(
        await page.evaluate(
          (hash) => globalThis.guard.checkIntegrity("/asset", hash),
          expected,
        ),
        true,
      );
      report.cases.push({
        engine,
        case: "streaming-deadline",
        incompleteResponseSettledFalse: true,
        connectionCanceled: true,
        capacityReclaimed: true,
      });

      await page.evaluate(() =>
        globalThis.guard.update({ integrity: { timeoutMs: 2000 } }),
      );
      const pendingBefore = requests.filter(
        (r) => r.path === "/pending",
      ).length;
      await page.evaluate((hash) => {
        globalThis.pendingCheck = globalThis.guard.checkIntegrity(
          "/pending",
          hash,
        );
      }, expected);
      await assertEventually(
        () =>
          requests.filter((r) => r.path === "/pending").length > pendingBefore,
      );
      const pending = requests.filter((r) => r.path === "/pending").at(-1);
      const beforeCap = requests.filter((r) => r.path === "/asset").length;
      assert.equal(
        await page.evaluate(
          (hash) => globalThis.guard.checkIntegrity("/asset", hash),
          expected,
        ),
        false,
      );
      assert.equal(
        requests.filter((r) => r.path === "/asset").length,
        beforeCap,
      );
      await page.evaluate(() => globalThis.guard.destroy());
      assert.equal(await page.evaluate(() => globalThis.pendingCheck), false);
      await assertEventually(() => pending.closed);
      const expectedDiagnostic = (message) =>
        baselineNativeRedirectDiagnostic &&
        ["/redirect", "/redirect-control"].some((path) =>
          message.endsWith(
            new URL(base).host + path + " due to access control checks.",
          ),
        );
      assert.deepEqual(
        errors.filter((message) => !expectedDiagnostic(message)),
        [],
      );
      assert.deepEqual(await page.evaluate(() => globalThis.domFailures), []);
      report.cases.push({
        engine,
        case: "concurrency-and-teardown",
        excessRequestNeverSent: true,
        destructionSettlesPending: true,
        actualConnectionCanceled: true,
        unexpectedPageErrors: 0,
        unhandledDOMErrors: 0,
        expectedNativeRedirectDiagnostics:
          errors.filter(expectedDiagnostic).length,
        sdkFreeRedirectControl: true,
      });
    } finally {
      await browser.close();
    }
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  throw error;
} finally {
  if (server) {
    const closing = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closing;
  }
  await rm(root, { recursive: true, force: true });
  await writeFile(evidence, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
async function assertEventually(condition) {
  const until = Date.now() + 2000;
  while (!condition() && Date.now() < until)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(condition(), true);
}
