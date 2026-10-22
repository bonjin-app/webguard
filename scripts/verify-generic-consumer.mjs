import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";

const run = promisify(execFile);
const args = process.argv.slice(2);
const tarball = resolve(args[args.indexOf("--tarball") + 1] ?? "");
if (!args.includes("--tarball") || !tarball.endsWith(".tgz"))
  throw new Error(
    "Usage: node scripts/verify-generic-consumer.mjs --tarball PATH [--keep] [--evidence PATH]",
  );
const evidenceIndex = args.indexOf("--evidence");
const evidence =
  evidenceIndex >= 0 ? resolve(args[evidenceIndex + 1]) : undefined;
const keep = args.includes("--keep");
const repository = fileURLToPath(new URL("../", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "webguard-generic-consumer-"));
const result = {
  status: "running",
  checkedAt: new Date().toISOString(),
  project: root,
  tarball,
  integrity:
    "sha512-" +
    createHash("sha512")
      .update(await readFile(tarball))
      .digest("base64"),
  versions: { webpack: "5.112.0", esbuild: "0.28.2", jquery: "4.0.0" },
  viteInstalled: undefined,
  builds: [],
  browserCases: [],
};
const save = async () => {
  if (evidence)
    await writeFile(evidence, JSON.stringify(result, null, 2) + "\n");
};
async function command(file, parameters, cwd = root) {
  try {
    return await run(file, parameters, {
      cwd,
      timeout: 180000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `${file} ${parameters.join(" ")} failed\n${error.stdout ?? ""}\n${error.stderr ?? error.message}`,
      { cause: error },
    );
  }
}
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}
async function files(directory, prefix = "") {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory())
      output.push(
        ...(await files(
          join(directory, entry.name),
          prefix + entry.name + "/",
        )),
      );
    else output.push(prefix + entry.name);
  }
  return output;
}
async function captureStartupFailure(page, context) {
  let timer;
  try {
    const state = await Promise.race([
      page
        .evaluate(() => {
          const startup = document.querySelector("#startup");
          let automaticGuard;
          try {
            automaticGuard = Boolean(globalThis.WebGuardSDK?.getAutoGuard?.());
          } catch (error) {
            automaticGuard = String(error).slice(0, 2000);
          }
          return {
            readyState: document.readyState,
            startupText: startup?.textContent?.slice(0, 2000) ?? null,
            startupDisplay: startup
              ? globalThis.getComputedStyle(startup).display
              : null,
            sdkType: typeof globalThis.WebGuardSDK,
            automaticGuard,
            scripts: Array.from(document.scripts)
              .slice(0, 16)
              .map((script) => ({
                src: script.src.slice(0, 2048),
                type: script.type,
                async: script.async,
                defer: script.defer,
                integrity: script.integrity,
              })),
            cspViolations: globalThis.webguardConsumerCspViolations ?? [],
          };
        })
        .catch((error) => ({ stateUnavailable: error.message.slice(0, 2000) })),
      new Promise((resolve) => {
        timer = setTimeout(
          () => resolve({ stateUnavailable: "Page state exceeded 1000 ms" }),
          1000,
        );
      }),
    ]);
    return {
      ...context,
      pageErrors: context.pageErrors.slice(0, 32),
      ...state,
    };
  } finally {
    clearTimeout(timer);
  }
}
async function preserveFailureFixture(output) {
  if (!evidence) return undefined;
  const fixtureFiles = [];
  let bytes = 0;
  for (const path of await files(output)) {
    const content = await readFile(join(output, path));
    bytes += content.byteLength;
    if (fixtureFiles.length >= 32 || bytes > 4 * 1024 * 1024)
      throw new Error("Failure fixture exceeds the 32-file/4-MiB budget");
    fixtureFiles.push({
      path,
      bytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  const directory = await mkdtemp(join(dirname(evidence), "generic-failure-"));
  await cp(output, join(directory, "protected"), { recursive: true });
  return { directory, files: fixtureFiles };
}
async function observeKey(page, target, combination) {
  const key = combination.split("+").at(-1);
  const code = key === "F12" ? key : "Key" + key.toUpperCase();
  await page.evaluate((code) => {
    globalThis.inputReceipt = undefined;
    const observe = (event) => {
      if (event.code !== code) return;
      document.removeEventListener("keydown", observe);
      globalThis.queueMicrotask(() => {
        globalThis.inputReceipt = {
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
        };
      });
    };
    document.addEventListener("keydown", observe);
  }, code);
  await target.focus();
  await page.keyboard.press(combination);
  return page.evaluate(() => globalThis.inputReceipt);
}
const servers = [];
try {
  await save();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  await command("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    tarball,
    "webpack@5.112.0",
    "esbuild@0.28.2",
    "jquery@4.0.0",
  ]);
  result.viteInstalled = existsSync(join(root, "node_modules/vite"));
  assert.equal(
    result.viteInstalled,
    false,
    "Generic consumers must not install Vite",
  );
  const installed = join(root, "node_modules/uulab-webguard");
  const api = await import(
    pathToFileURL(join(installed, "dist/build.js")).href
  );
  await writeFile(
    join(root, "types.ts"),
    `import { protectAppDirectory, type ProtectAppOptions } from 'uulab-webguard/build';
const options: ProtectAppOptions = { output: 'protected', runtime: { devtools: { blockShortcuts: true } }, headers: { trustedTypes: 'report-only' } };
void protectAppDirectory('dist', options);
`,
  );
  await command(process.execPath, [
    join(repository, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--skipLibCheck",
    "false",
    "types.ts",
  ]);
  result.typesWithoutVite = true;
  const { createProtectedServer } = await import(
    pathToFileURL(join(installed, "dist/server.js")).href
  );
  const cli = join(root, "node_modules/.bin/webguard");
  assert.match((await command(cli, ["--version"])).stdout, /^0\.3\.0\s*$/);
  const hosts = [];
  for (const name of ["webpack", "esbuild", "plain-html"]) {
    const project = join(root, name);
    await cp(join(repository, "examples", name), project, {
      recursive: true,
      filter: (source) =>
        !source.includes("node_modules") && !source.includes("/dist"),
    });
    await command("node", ["build.mjs"], project);
    const input = join(project, "dist"),
      output = join(project, "dist-protected");
    const sourceFiles = await files(input);
    const original = new Map(
      await Promise.all(
        sourceFiles.map(async (path) => [
          path,
          await readFile(join(input, path)),
        ]),
      ),
    );
    // Exercise the installed CLI for two tools, and the independent Node API for esbuild.
    if (name === "esbuild")
      await api.protectAppDirectory(input, {
        output,
        headers: { trustedTypes: "report-only" },
      });
    else
      await command(cli, [
        "protect-app",
        input,
        "--output",
        output,
        "--trusted-types",
        "report-only",
      ]);
    for (const [path, bytes] of original)
      assert.deepEqual(
        await readFile(join(input, path)),
        bytes,
        "Original build changed",
      );
    const report = JSON.parse(
      await readFile(join(output, "webguard-report.json"), "utf8"),
    );
    assert.equal(report.preset, "strict");
    assert.ok(
      report.files
        .filter((file) => /\.js$/.test(file.path))
        .every((file) => file.transformed),
    );
    assert.equal(
      (await files(output)).some((file) => /\.map$/.test(file)),
      false,
    );
    const manifest = JSON.parse(
      await readFile(join(output, "webguard-manifest.json"), "utf8"),
    );
    assert.equal((await api.verifyManifest(output, manifest)).valid, true);
    const html = await readFile(join(output, "index.html"), "utf8");
    assert.match(html, /integrity="sha384-/);
    const server = await createProtectedServer(output);
    servers.push(server);
    const url = await listen(server);
    const response = await fetch(url);
    assert.match(
      response.headers.get("content-security-policy"),
      /script-src 'self'/,
    );
    assert.equal((await fetch(url + "/webguard-report.json")).status, 404);
    assert.equal((await fetch(url + "/assets/app.js.map")).status, 404);
    const buildReceipt = {
      name,
      url,
      jsFiles: report.files.filter((file) => /\.js$/.test(file.path)).length,
      transformed: true,
      manifestValid: true,
      inputPreserved: true,
      sourceMapsPublic: false,
    };
    result.builds.push(buildReceipt);
    hosts.push({ name, url, output });
    await save();
  }
  // A classic script is usable by server templates without a build-tool runtime.
  const manualInput = join(root, "manual-input");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(manualInput);
  await cp(
    join(installed, "dist/browser.global.js"),
    join(manualInput, "sdk.js"),
  );
  await writeFile(
    join(manualInput, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><script src="./sdk.js"></script><script defer src="./app.js"></script></head><body><div id="input-target" tabindex="0">Manual SDK</div></body></html>',
  );
  await writeFile(
    join(manualInput, "app.js"),
    'document.body.dataset.automatic=String(Boolean(globalThis.WebGuardSDK.getAutoGuard()));globalThis.manualGuard=WebGuardSDK.WebGuard.init({devtools:{blockShortcuts:true}});document.body.dataset.manual="ready";',
  );
  const manualOutput = join(root, "manual-protected");
  await api.protectAppDirectory(manualInput, {
    output: manualOutput,
    runtime: false,
  });
  const manualServer = await createProtectedServer(manualOutput);
  servers.push(manualServer);
  const manualUrl = await listen(manualServer);
  for (const [engineName, engine] of Object.entries({
    chromium,
    firefox,
    webkit,
  })) {
    const browser = await engine.launch();
    try {
      for (const host of hosts) {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const startupContext = {
          engine: engineName,
          tool: host.name,
          url: host.url,
          phase: "navigation",
          pageErrors: errors,
          consoleErrors: [],
          failedRequests: [],
          responses: [],
        };
        page.on("console", (message) => {
          if (
            message.type() === "error" &&
            startupContext.consoleErrors.length < 32
          )
            startupContext.consoleErrors.push(message.text().slice(0, 2000));
        });
        page.on("requestfailed", (request) => {
          if (startupContext.failedRequests.length < 32)
            startupContext.failedRequests.push({
              url: request.url().slice(0, 2048),
              error: request.failure()?.errorText,
            });
        });
        page.on("response", (response) => {
          const type = response.request().resourceType();
          if (
            startupContext.responses.length < 32 &&
            (type === "document" ||
              type === "script" ||
              response.status() >= 400)
          ) {
            const headers = response.headers();
            startupContext.responses.push({
              url: response.url().slice(0, 2048),
              status: response.status(),
              type,
              contentType: headers["content-type"],
              csp: headers["content-security-policy"],
              cspReportOnly: headers["content-security-policy-report-only"],
            });
          }
        });
        await page.addInitScript(() => {
          globalThis.webguardConsumerCspViolations = [];
          document.addEventListener("securitypolicyviolation", (event) => {
            const records = globalThis.webguardConsumerCspViolations;
            if (records.length < 32)
              records.push({
                directive: event.effectiveDirective,
                blockedURI: event.blockedURI.slice(0, 2048),
                disposition: event.disposition,
                sourceFile: event.sourceFile.slice(0, 2048),
                line: event.lineNumber,
                column: event.columnNumber,
              });
          });
        });
        try {
          await page.goto(host.url);
          startupContext.phase = "automatic-startup";
          await page
            .locator("#startup")
            .filter({ hasText: "SDK ready before app" })
            .waitFor();
        } catch (error) {
          result.browserFailure = await captureStartupFailure(
            page,
            startupContext,
          );
          try {
            result.browserFailure.fixture = await preserveFailureFixture(
              host.output,
            );
          } catch (fixtureError) {
            result.browserFailure.fixtureError = fixtureError.message;
          }
          await save();
          throw error;
        }
        assert.equal(
          await page.evaluate(
            () =>
              globalThis.WebGuardSDK.getAutoGuard().getOptions().devtools
                .blockShortcuts ?? false,
          ),
          false,
        );
        await page.locator("#calculate").click();
        assert.equal(
          await page.locator("#result").textContent(),
          "Order total: 55",
        );
        if (host.name !== "plain-html") {
          await page.locator("#load-lazy").click();
          await page
            .locator("#lazy-result")
            .filter({ hasText: "Lazy quote: 19800" })
            .waitFor();
        }
        const target = page.locator("#input-target");
        assert.deepEqual(await observeKey(page, target, "F12"), {
          trusted: true,
          prevented: false,
        });
        await page.evaluate(() =>
          globalThis.WebGuardSDK.getAutoGuard().update({
            devtools: { blockShortcuts: true, blockContextMenu: true },
          }),
        );
        for (const key of ["F12", "Control+Shift+I", "Meta+Alt+I"])
          assert.deepEqual(
            await observeKey(page, target, key),
            {
              trusted: true,
              prevented: true,
            },
            `${engineName}/${host.name}: ${key}`,
          );
        await page.evaluate(() => {
          document.addEventListener(
            "contextmenu",
            (event) => {
              globalThis.queueMicrotask(() => {
                globalThis.menuPrevented = event.defaultPrevented;
              });
            },
            { once: true },
          );
        });
        await target.click({ button: "right" });
        assert.equal(await page.evaluate(() => globalThis.menuPrevented), true);
        await page.evaluate(() =>
          globalThis.WebGuardSDK.getAutoGuard().update({
            devtools: { blockShortcuts: false, blockContextMenu: false },
          }),
        );
        assert.deepEqual(await observeKey(page, target, "F12"), {
          trusted: true,
          prevented: false,
        });
        assert.deepEqual(errors, []);
        // SRI must reject a modified entry without altering the expected HTML hash.
        await page.route("**/assets/app.js", async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            body: (await response.text()) + "\n/* changed */",
          });
        });
        await page.reload();
        assert.equal(
          await page.locator("#startup").textContent(),
          "SDK 확인 중",
        );
        result.browserCases.push({
          engine: engineName,
          tool: host.name,
          sdkBeforeApp: true,
          calculation: true,
          dynamicImport: host.name !== "plain-html",
          defaultOff: true,
          trustedInputs: 5,
          contextRestriction: true,
          sriTamperRejected: true,
        });
        await page.close();
        await save();
      }
      const page = await browser.newPage();
      await page.goto(manualUrl);
      await page.locator('body[data-manual="ready"]').waitFor();
      assert.equal(await page.getAttribute("body", "data-automatic"), "false");
      assert.deepEqual(
        await observeKey(page, page.locator("#input-target"), "F12"),
        { trusted: true, prevented: true },
      );
      result.browserCases.push({
        engine: engineName,
        tool: "manual-classic-script",
        noAutomaticStartup: true,
        explicitInitialization: true,
        trustedShortcutBlocked: true,
      });
      await page.close();
      await save();
    } finally {
      await browser.close();
    }
  }
  result.status = "passed";
  console.log(
    JSON.stringify({
      status: result.status,
      project: root,
      builds: result.builds.length,
      browserCases: result.browserCases.length,
      viteInstalled: result.viteInstalled,
    }),
  );
} catch (error) {
  result.status = "failed";
  result.error = error.stack ?? String(error);
  throw error;
} finally {
  await save();
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
  if (!keep) await rm(root, { recursive: true, force: true });
}
