// Installs a separately packed candidate; never publishes or replaces release artifacts.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { chromium, firefox, webkit } from "@playwright/test";

const args = process.argv.slice(2);
const tarIndex = args.indexOf("--tarball");
if (tarIndex < 0 || !args[tarIndex + 1])
  throw Error("Use --tarball PATH [--evidence PATH]");
const tarball = resolve(args[tarIndex + 1]);
const evidenceIndex = args.indexOf("--evidence");
const evidence =
  evidenceIndex < 0 ? undefined : resolve(args[evidenceIndex + 1]);
const root = await mkdtemp(join(tmpdir(), "webguard-page-block-"));
const run = promisify(execFile);
const report = {
  checkedAt: new Date().toISOString(),
  method:
    "Fresh installed tarball in unrelated Vite 8.3.4 project, native browser modal under generated HTTP CSP/Trusted Types policies",
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
    JSON.stringify({ private: true, type: "module" }),
  );
  await run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarball,
      "vite@8.3.4",
    ],
    { cwd: root, timeout: 180000 },
  );
  await writeFile(
    join(root, "index.html"),
    '<!doctype html><html><head><meta charset="UTF-8"></head><body><input id="editor" aria-label="Editor"><button id="action">Action</button><p id="status"></p><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(
    join(root, "main.js"),
    `import {getWebGuard} from 'uulab-webguard/client';
globalThis.guard=getWebGuard();globalThis.events=[];
globalThis.guard.update({onThreat:e=>events.push(e.type)});
document.addEventListener('keydown',e=>queueMicrotask(()=>{globalThis.inputReceipt={trusted:e.isTrusted,prevented:e.defaultPrevented}}));
document.querySelector('#status').textContent=guard?'Ready':'Missing SDK';`,
  );
  await writeFile(
    join(root, "vite.config.js"),
    `import {webguardApp} from 'uulab-webguard';
export default {plugins:[webguardApp({runtime:{devtools:{detect:false,blockShortcuts:true,shortcutScope:'page',response:'block'},integrity:{enabled:true,timeoutMs:10000,maxBytes:1048576,maxConcurrent:2}}})]};`,
  );
  await run("node", [join(root, "node_modules/vite/bin/vite.js"), "build"], {
    cwd: root,
    timeout: 180000,
  });
  const { createProtectedServer } = await import(
    pathToFileURL(join(root, "node_modules/uulab-webguard/dist/server.js")).href
  );
  server = await createProtectedServer(join(root, "dist"));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const [engine, launcher] of Object.entries({
    chromium,
    firefox,
    webkit,
  })) {
    const browser = await launcher.launch();
    const errors = [];
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const ready = async () => {
      await page.goto(url);
      await page.locator("#status").filter({ hasText: "Ready" }).waitFor();
    };
    const trigger = async () => {
      await page.locator("#editor").focus();
      await page.keyboard.press("Meta+Alt+KeyI");
    };
    const modal = page.locator("dialog[data-webguard-blocker]");
    try {
      await ready();
      assert.deepEqual(
        await page.evaluate(() => globalThis.guard.getOptions().integrity),
        {
          enabled: true,
          timeoutMs: 10000,
          maxBytes: 1048576,
          maxConcurrent: 2,
        },
      );
      const headers = await (await page.request.get(url)).headers();
      assert.match(
        headers["content-security-policy"],
        /require-trusted-types-for 'script'/,
      );
      await page.locator("#editor").fill("일반 입력과 편집");
      await trigger();
      assert.deepEqual(await page.evaluate(() => globalThis.inputReceipt), {
        trusted: true,
        prevented: true,
      });
      assert.equal(
        await modal.evaluate((node) => node.matches(":modal")),
        true,
      );
      await page.keyboard.press("Escape");
      assert.equal(await modal.isVisible(), true);
      await page.evaluate(() => {
        // Explicit flat-geometry fixture distinguishes an update from a resize.
        Object.defineProperty(window, "outerWidth", {
          configurable: true,
          get: () => window.innerWidth,
        });
        Object.defineProperty(window, "outerHeight", {
          configurable: true,
          get: () => window.innerHeight,
        });
        globalThis.guard.update({ devtools: { detect: true } });
        globalThis.guard.update({ integrity: { enabled: true } });
      });
      assert.equal(
        await modal.evaluate((node) => node.matches(":modal")),
        true,
      );
      await page.locator("#editor").evaluate((node) => node.focus());
      assert.equal(
        await page
          .locator("#editor")
          .evaluate((node) => node === document.activeElement),
        false,
      );
      await modal.locator("[data-webguard-recheck]").click();
      assert.equal(await modal.count(), 0);
      await page.locator("#editor").fill("해제 후 편집 가능");
      assert.equal(
        await page.locator("#editor").inputValue(),
        "해제 후 편집 가능",
      );
      assert.deepEqual(await page.evaluate(() => globalThis.events), [
        "shortcut-blocked",
        "page-blocked",
        "page-unblocked",
      ]);
      report.cases.push({
        engine,
        case: "installed-vite-native-modal",
        trustedInspectFromEditor: true,
        nativeModal: true,
        escapeRetained: true,
        backgroundInert: true,
        recheckCleared: true,
        enforcedTrustedTypes: true,
      });

      // Native showModal focus can synchronously run arbitrary host lifecycle callbacks.
      for (const action of ["destroy", "monitor", "integrity"]) {
        await ready();
        await page.evaluate((action) => {
          document.addEventListener(
            "focusin",
            (event) => {
              if (!event.target.closest?.("[data-webguard-blocker]")) return;
              if (action === "destroy") globalThis.guard.destroy();
              else if (action === "monitor")
                globalThis.guard.update({ devtools: { response: "monitor" } });
              else globalThis.guard.update({ integrity: { enabled: true } });
            },
            {
              once: false,
              signal: (() => {
                const controller = new globalThis.AbortController();
                globalThis.focusController = controller;
                return controller.signal;
              })(),
            },
          );
        }, action);
        await trigger();
        assert.equal(
          await modal.count(),
          action === "integrity" ? 1 : 0,
          `${engine}/${action}: modal lifecycle`,
        );
        assert.deepEqual(
          await page.evaluate(() => globalThis.events),
          action === "integrity"
            ? ["shortcut-blocked", "page-blocked"]
            : ["shortcut-blocked"],
        );
        await page.evaluate(() => globalThis.focusController.abort());
        report.cases.push({
          engine,
          case: `native-show-focus-${action}`,
          expectedModalState: action === "integrity" ? "retained" : "removed",
          truthfulBlockedEvent: true,
        });
      }

      // Native close restores focus; a callback can immediately install a new block policy.
      await ready();
      await trigger();
      await page.evaluate(() => {
        const input = document.querySelector("#editor");
        input.addEventListener(
          "focus",
          () => {
            Object.defineProperty(window, "outerWidth", {
              configurable: true,
              get: () => window.innerWidth + 300,
            });
            globalThis.guard.update({
              devtools: { response: "block", detect: true },
            });
          },
          { once: true },
        );
        globalThis.guard.update({ devtools: { response: "monitor" } });
      });
      assert.equal(
        await modal.evaluate((node) => node.matches(":modal")),
        true,
      );
      assert.equal(
        (await page.evaluate(() => globalThis.events)).at(-1),
        "page-blocked",
      );
      await page.evaluate(() => {
        Object.defineProperty(window, "outerWidth", {
          configurable: true,
          get: () => window.innerWidth,
        });
        Object.defineProperty(window, "outerHeight", {
          configurable: true,
          get: () => window.innerHeight,
        });
        globalThis.dispatchEvent(new globalThis.Event("resize"));
      });
      assert.equal(await modal.count(), 0);
      assert.equal(
        (await page.evaluate(() => globalThis.events)).at(-1),
        "page-unblocked",
      );
      report.cases.push({
        engine,
        case: "native-close-focus-policy-update",
        explicitSimulatedGeometry: true,
        newModalTracked: true,
        signalClearRemoved: true,
      });
      assert.deepEqual(errors, []);
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
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
  if (evidence)
    await writeFile(evidence, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
