import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { chromium, firefox, webkit } from "@playwright/test";

const run = promisify(execFile);
const repository = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "webguard-ssr-"));
const result = {
  checkedAt: new Date().toISOString(),
  http: [],
  browsers: [],
  skipped: [],
};
const children = [];
const args = process.argv.slice(2);
const evidence = args.includes("--evidence")
  ? resolve(args[args.indexOf("--evidence") + 1])
  : undefined;
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function available(command) {
  try {
    await run(command, ["--version"], { timeout: 10000 });
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function waitFor(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error("SSR server exited before ready");
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Wait for the owned server. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("SSR server readiness deadline exceeded");
}
try {
  await run(
    process.execPath,
    ["scripts/prepare-ssr-templates.mjs", "--output", temp],
    { cwd: repository, timeout: 180000 },
  );
  const policy = JSON.parse(
    await readFile(join(temp, "private/policy.json"), "utf8"),
  );
  assert.equal(policy.preset, "strict");
  assert.deepEqual(Object.keys(policy.assets).sort(), [
    "app.js",
    "init.js",
    "style.css",
    "webguard.global.js",
  ]);
  for (const [name, asset] of Object.entries(policy.assets)) {
    const bytes = await readFile(join(temp, "public/assets", name));
    assert.equal(
      asset.integrity,
      "sha384-" + createHash("sha384").update(bytes).digest("base64"),
    );
    assert.ok(!bytes.toString().includes("sourceMappingURL"));
  }
  const report = JSON.parse(
    await readFile(join(temp, "private/webguard-report.json"), "utf8"),
  );
  assert.ok(
    report.files
      .filter((file) => file.path.endsWith(".js"))
      .every((file) => file.transformed),
  );
  const runtimes = [
    {
      name: "Python WSGI",
      command: process.env.WEBGUARD_PYTHON ?? "python3",
      parameters: (port) => [
        "examples/ssr-templates/python/server.py",
        "--port",
        String(port),
      ],
    },
    {
      name: "PHP",
      command: process.env.WEBGUARD_PHP ?? "php",
      parameters: (port) => [
        "-S",
        `127.0.0.1:${port}`,
        "-t",
        join(temp, "public"),
        "examples/ssr-templates/php/router.php",
      ],
    },
  ];
  if (process.env.WEBGUARD_PHP_WASM_MODULES)
    runtimes.push({
      name: "PHP 8.4 WASM (not native PHP-FPM)",
      apiName: "PHP",
      command: process.env.WEBGUARD_PHP_WASM_NODE ?? process.execPath,
      parameters: (port) => [
        "examples/ssr-templates/php/wasm-test-server.mjs",
        "--port",
        String(port),
      ],
    });
  for (const runtime of runtimes) {
    if (!(await available(runtime.command))) {
      result.skipped.push({
        runtime: runtime.name,
        reason: "Runtime executable unavailable; not verified",
      });
      continue;
    }
    const port = await freePort();
    const base = `http://127.0.0.1:${port}/app/`;
    const child = spawn(runtime.command, runtime.parameters(port), {
      cwd: repository,
      env: {
        ...process.env,
        WEBGUARD_SSR_OUTPUT: temp,
        WEBGUARD_BASE_PATH: "/app/",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    children.push(child);
    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      stderr += error.message;
    });
    try {
      await waitFor(base, child);
    } catch (error) {
      throw new Error(`${runtime.name}: ${error.message}: ${stderr}`, {
        cause: error,
      });
    }
    for (const path of [
      "",
      "api/status",
      "assets/app.js",
      "missing",
      "assets/app.js.map",
      "private/policy.json",
      "template.html",
      "assets/webguard-report.json",
      "assets/../template.html",
      ".env",
      "router.php",
      "server.py",
    ]) {
      const response = await fetch(base + path);
      const expected = ["", "api/status", "assets/app.js"].includes(path)
        ? 200
        : 404;
      assert.equal(response.status, expected, `${runtime.name}: ${path}`);
      assert.equal(
        response.headers.get("content-security-policy"),
        policy.headers["Content-Security-Policy"],
      );
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      result.http.push({
        runtime: runtime.name,
        path: path || "/",
        status: response.status,
      });
    }
    const first = await (
      await fetch(base + "?name=%3Cscript%3Eevil%3C%2Fscript%3E")
    ).text();
    assert.ok(first.includes("&lt;script&gt;evil&lt;/script&gt;"));
    assert.ok(!first.includes("<script>evil</script>"));
    const firstId = first.match(/id="request-id">([^<]+)/)[1];
    const second = await (await fetch(base)).text();
    assert.notEqual(firstId, second.match(/id="request-id">([^<]+)/)[1]);
    const literal = await (
      await fetch(base + "?name=%7B%7BrequestId%7D%7D")
    ).text();
    assert.ok(literal.includes('id="greeting">{{requestId}}</strong>'));
    for (const [method, expected] of [
      ["HEAD", 200],
      ["POST", 405],
    ]) {
      const response = await fetch(base, { method });
      assert.equal(response.status, expected);
      assert.equal(
        response.headers.get("content-security-policy"),
        policy.headers["Content-Security-Policy"],
      );
      if (method === "HEAD") assert.equal(await response.text(), "");
      result.http.push({
        runtime: runtime.name,
        path: "/",
        method,
        status: response.status,
      });
    }
    for (const [engine, browserType] of Object.entries({
      chromium,
      firefox,
      webkit,
    })) {
      const browser = await browserType.launch();
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(base + "?name=SSR%20browser", {
          waitUntil: "networkidle",
        });
        assert.equal(
          await page.locator("#greeting").textContent(),
          "SSR browser",
        );
        await page
          .locator("#client-status")
          .filter({ hasText: "ready" })
          .waitFor();
        await page.locator("#counter").click();
        assert.equal(await page.locator("#count").textContent(), "1");
        await page.locator("#load-api").click();
        await page.locator('#api-result[data-loaded="true"]').waitFor();
        assert.ok(
          (await page.locator("#api-result").textContent()).includes(
            runtime.apiName ?? runtime.name,
          ),
        );
        const receipt = async () => {
          await page.evaluate(() => {
            window.ssrKeyReceipt = undefined;
            const observe = (event) => {
              if (event.code !== "KeyI") return;
              document.removeEventListener("keydown", observe);
              window.queueMicrotask(() => {
                window.ssrKeyReceipt = {
                  trusted: event.isTrusted,
                  prevented: event.defaultPrevented,
                };
              });
            };
            document.addEventListener("keydown", observe);
          });
          await page.keyboard.press("Meta+Alt+i");
          return page.evaluate(() => window.ssrKeyReceipt);
        };
        assert.deepEqual(await receipt(), { trusted: true, prevented: true });
        await page.locator("#guard-toggle").uncheck();
        assert.deepEqual(await receipt(), { trusted: true, prevented: false });
        await page.locator("#guard-toggle").check();
        assert.deepEqual(await receipt(), { trusted: true, prevented: true });
        // Script injection is blocked by the actual HTTP CSP, not an SDK claim.
        await page.evaluate(() => {
          const script = document.createElement("script");
          script.textContent = "window.inlineInjectionExecuted=true";
          document.body.append(script);
        });
        assert.equal(
          await page.evaluate(() => window.inlineInjectionExecuted === true),
          false,
        );
        assert.deepEqual(errors, []);
        // Modify real served app bytes while preserving HTML SRI: browser must refuse it.
        const tampered = await browser.newPage();
        await tampered.route("**/assets/app.js", async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            body: (await response.text()) + "\nwindow.sriTampered=true;",
          });
        });
        await tampered.goto(base, { waitUntil: "networkidle" });
        assert.equal(
          await tampered.locator("#client-status").textContent(),
          "loading",
        );
        assert.equal(
          await tampered.evaluate(() => window.sriTampered === true),
          false,
        );
        result.browsers.push({
          runtime: runtime.name,
          engine,
          status: "passed",
          checks: [
            "SSR dynamic greeting",
            "protected client counter",
            "API",
            "guard policy toggle (trusted Meta+Alt+I input)",
            "HTTP CSP injection rejection",
            "SRI tamper rejection",
          ],
        });
      } finally {
        await browser.close();
      }
    }
  }
  assert.ok(
    result.http.length > 0,
    "At least one real server runtime is required",
  );
  result.status = result.skipped.length ? "passed-with-skips" : "passed";
} catch (error) {
  result.status = "failed";
  result.error = error.message;
  process.exitCode = 1;
} finally {
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
  if (evidence)
    await writeFile(evidence, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  await rm(temp, { recursive: true, force: true });
}
