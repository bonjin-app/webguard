import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium, firefox, webkit } from "@playwright/test";
import { JSDOM } from "jsdom";

const run = promisify(execFile);
const args = process.argv.slice(2);
const value = (flag) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
if (!value("--tarball"))
  throw new Error(
    "Usage: node scripts/verify-runtime-consumer.mjs --tarball PATH [--evidence PATH] [--keep]",
  );
const tarball = resolve(value("--tarball"));
const evidence = value("--evidence") ? resolve(value("--evidence")) : undefined;
const project = await mkdtemp(join(tmpdir(), "webguard-runtime-consumer-"));
const result = {
  status: "running",
  checkedAt: new Date().toISOString(),
  tarballSha512: createHash("sha512")
    .update(await readFile(tarball))
    .digest("hex"),
  versions: {},
  checks: {},
  browsers: [],
  scope:
    "Fresh installed Vite build with one webguardApp configuration; opt-in CSS Modules naming, static DOM monitoring and explicit normal timer sample. Does not prove DevTools detection, closure or resistance to a user controlling the browser.",
};
async function save() {
  if (evidence) {
    await mkdir(dirname(evidence), { recursive: true });
    await writeFile(evidence, JSON.stringify(result, null, 2) + "\n");
  }
}
async function command(parameters) {
  try {
    return await run(parameters[0], parameters.slice(1), {
      cwd: project,
      timeout: 300000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `${parameters.join(" ")} failed\n${error.stdout ?? ""}\n${error.stderr ?? error.message}`,
      { cause: error },
    );
  }
}
async function reservePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
let server;
let serverLog = "";
try {
  await writeFile(
    join(project, "package.json"),
    JSON.stringify(
      {
        name: "webguard-runtime-consumer",
        private: true,
        type: "module",
        dependencies: { vite: "8.3.4", "uulab-webguard": `file:${tarball}` },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(project, "vite.config.js"),
    `import { defineConfig } from 'vite';
import { webguardApp } from 'uulab-webguard';
export default defineConfig({plugins:[webguardApp({domIdentifiers:true,runtime:{devtools:{detect:false},domIntegrity:{enabled:true,selectors:['#static-notice'],response:'report'},debugging:{enabled:true}}})]});\n`,
  );
  await mkdir(join(project, "public"));
  await writeFile(
    join(project, "public/favicon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="blue"/></svg>',
  );
  await writeFile(
    join(project, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><title>Installed runtime guards</title><link rel="icon" href="/favicon.svg"></head><body><div id="notice-parent"><p id="static-notice">Trusted static notice</p></div><p id="style-target">Module style</p><button id="tamper">Change text</button><button id="attribute">Change attribute</button><button id="remove">Remove anchor</button><button id="replace">Replace anchor</button><button id="restore">Restore and rebaseline</button><button id="disable">Disable monitoring</button><button id="enable">Enable monitoring</button><button id="sample">Sample normal timer</button><output id="state"></output><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(
    join(project, "notice.module.css"),
    ".confidentialPaymentStatus { background-color: #2563eb; color: white; }",
  );
  await writeFile(
    join(project, "main.js"),
    `import styles from './notice.module.css';
import { getWebGuard } from 'uulab-webguard/client';
const guard=getWebGuard();
if(!guard)throw new Error('SDK did not start before application');
const state={automaticBeforeApp:true,sameGuard:true,threats:[],timer:'pending',rebaseline:null};
const render=()=>{state.sameGuard=getWebGuard()===guard;state.options=guard.getOptions();document.querySelector('#state').textContent=JSON.stringify(state);};
guard.update({onThreat:event=>{state.threats.push({type:event.type,detail:event.detail});render();}});
document.querySelector('#style-target').className=styles.confidentialPaymentStatus;
const anchor=()=>document.querySelector('#static-notice');
document.querySelector('#tamper').onclick=()=>{anchor().textContent='Changed client notice';};
document.querySelector('#attribute').onclick=()=>{anchor().setAttribute('data-changed','yes');};
document.querySelector('#remove').onclick=()=>{anchor().remove();};
document.querySelector('#replace').onclick=()=>{const replacement=document.createElement('p');replacement.id='static-notice';replacement.textContent='Trusted static notice';anchor().replaceWith(replacement);};
document.querySelector('#restore').onclick=()=>{let node=anchor();if(!node){node=document.createElement('p');node.id='static-notice';document.querySelector('#notice-parent').append(node);}node.textContent='Trusted static notice';node.removeAttribute('data-changed');state.rebaseline=guard.rebaselineDom();render();};
document.querySelector('#disable').onclick=()=>{guard.update({domIntegrity:{enabled:false}});render();};
document.querySelector('#enable').onclick=()=>{guard.update({domIntegrity:{enabled:true}});render();};
document.querySelector('#sample').onclick=async()=>{state.timer=await guard.checkDebugging();render();};
render();\n`,
  );
  await command([
    "npm",
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ]);
  for (const name of ["vite", "uulab-webguard"])
    result.versions[name] = JSON.parse(
      await readFile(
        join(project, "node_modules", name, "package.json"),
        "utf8",
      ),
    ).version;
  await command([
    process.execPath,
    join(project, "node_modules/vite/bin/vite.js"),
    "build",
  ]);
  const dist = join(project, "dist");
  const html = await readFile(join(dist, "index.html"), "utf8");
  const dom = new JSDOM(html);
  const script = dom.window.document.querySelector(
    'script[type="module"][src]',
  );
  assert.ok(script);
  const entry = script.getAttribute("src");
  const integrity = script.getAttribute("integrity");
  assert.match(integrity, /^sha384-/);
  const bytes = await readFile(join(dist, entry.slice(1)));
  assert.equal(
    "sha384-" + createHash("sha384").update(bytes).digest("base64"),
    integrity,
  );
  assert.ok(!bytes.includes(Buffer.from("sourceMappingURL")));
  const assets = await readdir(join(dist, "assets"));
  assert.ok(!assets.some((name) => name.endsWith(".map")));
  const css = await readFile(
    join(
      dist,
      "assets",
      assets.find((name) => name.endsWith(".css")),
    ),
    "utf8",
  );
  assert.match(css, /\.wg_[a-f0-9]{24}/);
  assert.ok(!css.includes("confidentialPaymentStatus"));
  dom.window.close();
  result.checks.singleConfigBuild = true;
  result.checks.sriMatchesFinalBytes = true;
  result.checks.noPublicSourceMapArtifacts = true;
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      join(project, "node_modules/uulab-webguard/dist/serve.js"),
      "dist",
      "--port",
      String(port),
    ],
    { cwd: project, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (bytes) => {
    serverLog += bytes;
  });
  server.stderr.on("data", (bytes) => {
    serverLog += bytes;
  });
  const started = Date.now();
  for (;;) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Wait for the owned test server. */
    }
    if (server.exitCode !== null || Date.now() - started > 30000)
      throw new Error(`Consumer server did not start: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const served = await fetch(origin);
  assert.match(
    served.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
  assert.match(
    served.headers.get("content-security-policy"),
    /require-trusted-types-for 'script'/,
  );
  const publicEntry = await fetch(origin + entry);
  assert.equal(
    createHash("sha384")
      .update(Buffer.from(await publicEntry.arrayBuffer()))
      .digest("base64"),
    integrity.slice(7),
  );
  const probes = [
    entry + ".map",
    "/webguard-report.json",
    "/webguard-headers.json",
    "/_headers",
    "/package.json",
    "/.env",
    "/src/main.js",
  ];
  for (const path of probes)
    assert.equal(
      (await fetch(origin + path)).status,
      404,
      `Private path must be denied: ${path}`,
    );
  result.checks.realProtectedServerCSP = true;
  result.checks.httpEntrySRI = true;
  result.checks.privatePathsDenied = probes;
  for (const engine of [chromium, firefox, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      const errors = [],
        failedRequests = [];
      const record = { engine: engine.name(), errors, failedRequests };
      result.browsers.push(record);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400)
          failedRequests.push({
            path: new URL(response.url()).pathname,
            status: response.status(),
          });
      });
      page.on("requestfailed", (request) =>
        failedRequests.push({
          path: new URL(request.url()).pathname,
          error: request.failure()?.errorText,
        }),
      );
      await page.goto(origin, { waitUntil: "networkidle" });
      const state = () =>
        page
          .locator("#state")
          .evaluate((element) => JSON.parse(element.textContent));
      await page
        .locator("#state")
        .filter({ hasText: '"automaticBeforeApp":true' })
        .waitFor();
      const initial = await state();
      assert.equal(initial.sameGuard, true);
      assert.deepEqual(initial.threats, []);
      assert.equal(initial.options.domIntegrity.enabled, true);
      assert.equal(initial.options.debugging.enabled, true);
      const className = await page
        .locator("#style-target")
        .getAttribute("class");
      assert.match(className, /^wg_[a-f0-9]{24}$/);
      assert.equal(
        await page
          .locator("#style-target")
          .evaluate(
            (element) =>
              element.ownerDocument.defaultView.getComputedStyle(element)
                .backgroundColor,
          ),
        "rgb(37, 99, 235)",
      );
      record.opaqueCSSModulesWithComputedStyle = true;
      for (const action of ["tamper", "attribute", "remove", "replace"]) {
        const before = (await state()).threats.length;
        await page.locator("#" + action).click();
        await page.waitForFunction(
          (count) =>
            JSON.parse(document.querySelector("#state").textContent).threats
              .length ===
            count + 1,
          before,
        );
        assert.equal(
          (await state()).threats.at(-1).type,
          "dom-integrity-mismatch",
        );
        await page.locator("#restore").click();
        assert.equal((await state()).rebaseline, true);
      }
      record.textAttributesRemovalReplacementDetected = true;
      record.synchronousRestoreAndRebaseline = true;
      const beforeDisabled = (await state()).threats.length;
      await page.locator("#disable").click();
      assert.equal((await state()).options.domIntegrity.enabled, false);
      await page.locator("#tamper").click();
      await page.waitForTimeout(100);
      assert.equal((await state()).threats.length, beforeDisabled);
      await page.locator("#restore").click();
      assert.equal((await state()).rebaseline, false);
      await page.locator("#enable").click();
      assert.equal((await state()).options.domIntegrity.enabled, true);
      await page.locator("#tamper").click();
      await page.waitForFunction(
        (count) =>
          JSON.parse(document.querySelector("#state").textContent).threats
            .length ===
          count + 1,
        beforeDisabled,
      );
      await page.locator("#restore").click();
      assert.equal((await state()).rebaseline, true);
      record.liveDisableEnable = true;
      await page.locator("#sample").click();
      await page.waitForFunction(
        () =>
          JSON.parse(document.querySelector("#state").textContent).timer !==
          "pending",
      );
      assert.equal((await state()).timer, false);
      assert.equal((await state()).sameGuard, true);
      assert.equal(
        (await state()).threats.length,
        5,
        "One active SDK observer must emit one event per mutation",
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(failedRequests, []);
      record.normalTimerSample = true;
      record.oneAutoGuardInstance = true;
    } finally {
      await browser.close();
    }
  }
  result.status = "passed";
  await save();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result.status = "failed";
  result.error = error.message;
  await save();
  throw error;
} finally {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) resolve();
      else {
        server.once("exit", resolve);
        setTimeout(resolve, 5000).unref();
      }
    });
  }
  if (args.includes("--keep"))
    console.log(`Temporary consumer preserved: ${project}`);
  else await rm(project, { recursive: true, force: true });
}
