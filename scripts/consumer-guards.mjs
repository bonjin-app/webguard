// Integration checks deliberately resolve all application APIs from the installed tarball.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hash = (bytes) =>
  `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
const probe = "https://installed-consumer-fixture.invalid/probe";
const sentinel = "WebGuard consumer literal must be encoded 2026";
const fixture = "Same-origin resource integrity fixture\n";

export async function prepareConsumerGuards(directory) {
  await mkdir(join(directory, "public"));
  await writeFile(join(directory, "public/probe.txt"), fixture);
  let html = await readFile(join(directory, "index.html"), "utf8");
  html = html.replace(
    "</body>",
    '<button id="probe">Run policy probes</button><button id="lazy">Load module</button><input id="editable" aria-label="Editable exemption"><button id="integrity-on">Check integrity</button><button id="integrity-off">Disable integrity</button><pre id="observed"></pre><pre id="key-output"></pre><pre id="context-output"></pre><pre id="integrity-output"></pre><output id="lazy-output"></output></body>',
  );
  await writeFile(join(directory, "index.html"), html);
  await writeFile(
    join(directory, "lazy.js"),
    `export const message=${JSON.stringify(sentinel)};\n`,
  );
  const source = await readFile(join(directory, "main.js"), "utf8");
  await writeFile(
    join(directory, "main.js"),
    source +
      `
const startupGuard=getWebGuard();
const observed={automaticBeforeApp:Boolean(startupGuard),events:[],threats:[],trustedTypes:typeof globalThis.trustedTypes?.createPolicy==='function'};
const output=document.querySelector('#observed');
function renderProbe(){output.textContent=JSON.stringify(observed);}
startupGuard?.update({onThreat:event=>{observed.threats.push(event.type);renderProbe();}});
document.addEventListener('securitypolicyviolation',event=>{observed.events.push(event.effectiveDirective);renderProbe();});
window.addEventListener('keydown',event=>{document.querySelector('#key-output').textContent=JSON.stringify({key:event.key,prevented:event.defaultPrevented,trusted:event.isTrusted});});
window.addEventListener('contextmenu',event=>{document.querySelector('#context-output').textContent=JSON.stringify({prevented:event.defaultPrevented,trusted:event.isTrusted});});
document.querySelector('#probe').addEventListener('click',async()=>{
  observed.inline=false;observed.eval=false;observed.sink=false;
  try{const script=document.createElement('script');script.textContent="document.documentElement.dataset.inlineProbe='executed'";document.body.append(script);observed.inline=document.documentElement.dataset.inlineProbe==='executed';script.remove();}catch(error){observed.inlineError=error.name;}
  try{observed.eval=globalThis.eval('6 * 7')===42;}catch(error){observed.evalError=error.name;}
  try{const target=document.createElement('div');target.innerHTML='<b>Fixed harmless sink</b>';observed.sink=Boolean(target.querySelector('b'));}catch(error){observed.sinkError=error.name;}
  const same=await fetch('/probe.txt');observed.sameOrigin=await same.text();
  try{const response=await fetch(${JSON.stringify(probe)});observed.external=await response.text();}catch(error){observed.external='blocked';}
  observed.done=true;renderProbe();
});
document.querySelector('#lazy').addEventListener('click',async()=>{const module=await import('./lazy.js');document.querySelector('#lazy-output').textContent=module.message;});
document.querySelector('#integrity-on').addEventListener('click',async()=>{
  const guard=getWebGuard();guard.update({integrity:{enabled:true}});
  const match=await guard.checkIntegrity('/probe.txt',${JSON.stringify(hash(fixture))});
  const mismatch=await guard.checkIntegrity('/probe.txt','sha384-'+ 'A'.repeat(64));
  document.querySelector('#integrity-output').textContent=JSON.stringify({match,mismatch});
});
document.querySelector('#integrity-off').addEventListener('click',async()=>{
  const guard=getWebGuard();guard.update({integrity:{enabled:false}});
  const result=await guard.checkIntegrity('/probe.txt',${JSON.stringify(hash(fixture))});
  document.querySelector('#integrity-output').textContent=JSON.stringify({disabled:result});
});
renderProbe();
`,
  );
}

async function staticHost(directory, servers) {
  const files = new Map();
  for (const entry of await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(
      "/" + relative(directory, path).split(sep).join("/"),
      await readFile(path),
    );
  }
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const name = path === "/" ? "/index.html" : path;
    const body = files.get(name);
    if (!body) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": name.endsWith(".html")
        ? "text/html; charset=utf-8"
        : name.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : "text/plain; charset=utf-8",
    });
    response.end(body);
  });
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function inspectBuild(directory) {
  const dist = join(directory, "dist");
  const report = JSON.parse(
    await readFile(join(dist, "webguard-report.json"), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(join(dist, "webguard-manifest.json"), "utf8"),
  );
  const entries = await readdir(dist, { recursive: true });
  check(
    !entries.some((path) => /\.(?:map|ts|tsx)$/.test(path)),
    "Public sources or maps survived the installed build",
  );
  const transforms = Object.entries(report.chunkTransforms);
  check(
    report.preset === "strict" &&
      transforms.length >= 2 &&
      transforms.every(
        ([, item]) => item.inputBytes > 0 && item.outputBytes > item.inputBytes,
      ),
    "Installed plugin did not transform entry and lazy chunks",
  );
  for (const [path, entry] of Object.entries(manifest.files)) {
    const bytes = await readFile(join(dist, path));
    check(
      bytes.byteLength === entry.size && hash(bytes) === entry.integrity,
      `Manifest bytes differ: ${path}`,
    );
    if (path.endsWith(".js")) {
      const code = bytes.toString("utf8");
      check(
        !code.includes(sentinel) && !code.includes("sourceMappingURL"),
        `Readable application sentinel/map in ${path}`,
      );
    }
  }
  const require = createRequire(join(directory, "package.json"));
  const { parse } = await import(pathToFileURL(require.resolve("parse5")).href);
  const document = parse(await readFile(join(dist, "index.html"), "utf8"));
  let sriResources = 0,
    entry;
  function walk(node) {
    const attrs = Object.fromEntries(
      (node.attrs ?? []).map((item) => [item.name, item.value]),
    );
    if (
      (node.tagName === "script" && attrs.src) ||
      (node.tagName === "link" &&
        ["stylesheet", "modulepreload"].includes(attrs.rel))
    ) {
      const name = (attrs.src ?? attrs.href).replace(/^\//, "");
      check(
        attrs.integrity === manifest.files[name]?.integrity,
        `Missing/mismatched HTML SRI: ${name}`,
      );
      sriResources++;
      if (node.tagName === "script" && attrs.type === "module") entry = name;
    }
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(document);
  check(sriResources > 0 && entry, "Installed build missing actual script SRI");
  return {
    transformedChunks: transforms.length,
    manifestFiles: Object.keys(manifest.files).length,
    manifestVerified: true,
    sriResources,
    publicSourceMaps: 0,
    literalEncoded: true,
    entry,
  };
}

async function exercise(
  browser,
  url,
  { protectedBuild, optIn = false, httpHeaders = false },
) {
  const context = await browser.newContext();
  const errors = [],
    requests = [];
  await context.route(probe, async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "external fixture reached",
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  let integrityFetches = 0;
  page.on("request", (request) => {
    if (request.url() === `${url}/probe.txt`) integrityFetches++;
  });
  try {
    const response = await page.goto(url);
    check(
      Boolean(response.headers()["content-security-policy"]) === httpHeaders,
      "Incorrect HTTP CSP test host",
    );
    await page.waitForFunction(() =>
      document
        .querySelector("#observed")
        .textContent.includes("automaticBeforeApp"),
    );
    let state = JSON.parse(await page.locator("#observed").textContent());
    check(
      state.automaticBeforeApp === protectedBuild,
      "SDK did not start before the application, or appeared in unprotected baseline",
    );
    await page.locator("#counter").click();
    check(
      (await page.locator("#counter").textContent()) === "Count: 1",
      "Counter broken after protection",
    );
    await page.locator("#lazy").click();
    await page.waitForFunction(
      () => document.querySelector("#lazy-output").textContent.length > 0,
    );
    check(
      (await page.locator("#lazy-output").textContent()) === sentinel,
      "Lazy module result changed",
    );
    await page.locator("#probe").click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#observed").textContent).done ===
        true,
    );
    if (protectedBuild)
      await page.waitForFunction(() =>
        JSON.parse(
          document.querySelector("#observed").textContent,
        ).events.includes("connect-src"),
      );
    state = JSON.parse(await page.locator("#observed").textContent());
    check(state.sameOrigin === fixture, "Legitimate same-origin fetch failed");
    check(
      state.inline === !protectedBuild && state.eval === !protectedBuild,
      "Inline/eval policy behavior differs from baseline expectation",
    );
    check(
      state.external ===
        (protectedBuild ? "blocked" : "external fixture reached") &&
        requests.length === (protectedBuild ? 0 : 1),
      "Network CSP failed its positive/negative control",
    );
    check(
      state.sink === (!protectedBuild || !state.trustedTypes),
      "Trusted Types support/enforcement result incorrect",
    );
    if (protectedBuild) {
      await page.waitForFunction(
        () => !document.querySelector("#toggle").disabled,
      );
      const options = JSON.parse(await page.locator("#status").textContent());
      check(
        options.preset === "strict" &&
          options.devtools.detect === true &&
          Boolean(options.devtools.blockShortcuts) === optIn,
        "SDK configuration did not match one Vite setting",
      );
      async function keyboard(key, expected) {
        await page.keyboard.press(key);
        const result = JSON.parse(
          await page.locator("#key-output").textContent(),
        );
        check(
          result.trusted && result.prevented === expected,
          `Trusted ${key} event interception differs: ${JSON.stringify(result)}`,
        );
      }
      await page.locator("#counter").focus();
      await keyboard("F12", optIn);
      await page.locator("#counter").click({ button: "right" });
      const initialMenu = JSON.parse(
        await page.locator("#context-output").textContent(),
      );
      check(
        initialMenu.trusted && initialMenu.prevented === optIn,
        "Build-time context menu setting failed",
      );
      await page.locator("#editable").fill("Editable input retained");
      await keyboard("F12", false);
      await page.locator("#editable").click({ button: "right" });
      check(
        !JSON.parse(await page.locator("#context-output").textContent())
          .prevented,
        "Build-time editable context exemption failed",
      );
      await page.locator("#toggle").click();
      const enabled = !optIn;
      await keyboard("F12", enabled);
      await keyboard("Control+Shift+I", enabled);
      await keyboard("Meta+Alt+J", enabled);
      await page.locator("#counter").click({ button: "right" });
      let menu = JSON.parse(
        await page.locator("#context-output").textContent(),
      );
      check(
        menu.trusted && menu.prevented === enabled,
        "Live context menu control failed",
      );
      await page.locator("#editable").fill("Editable input retained");
      await keyboard("F12", false);
      await page.locator("#editable").click({ button: "right" });
      menu = JSON.parse(await page.locator("#context-output").textContent());
      check(
        menu.trusted && !menu.prevented,
        "Editable context exemption broken",
      );
      await page.locator("#toggle").click();
      await keyboard("F12", optIn);
      const before = integrityFetches;
      await page.locator("#integrity-on").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#integrity-output")
          .textContent.includes("mismatch"),
      );
      const integrity = JSON.parse(
        await page.locator("#integrity-output").textContent(),
      );
      check(
        integrity.match &&
          !integrity.mismatch &&
          integrityFetches === before + 2,
        "Explicit runtime integrity check failed",
      );
      await page.locator("#integrity-off").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#integrity-output")
          .textContent.includes("disabled"),
      );
      check(
        JSON.parse(await page.locator("#integrity-output").textContent())
          .disabled === false && integrityFetches === before + 2,
        "Disabled integrity guard still fetched",
      );
      state = JSON.parse(await page.locator("#observed").textContent());
      check(
        state.threats.includes("shortcut-blocked") &&
          state.threats.includes("context-menu-blocked") &&
          state.threats.includes("integrity-mismatch"),
        "Installed SDK did not emit actual guard events",
      );
    }
    check(
      errors.length === 0,
      `Unexpected consumer page errors: ${errors.join("; ")}`,
    );
    return {
      automaticBeforeApp: state.automaticBeforeApp,
      counter: true,
      lazyModule: true,
      sameOriginFetch: true,
      inline: state.inline ? "executed" : "blocked",
      eval: state.eval ? "executed" : "blocked",
      externalRequests: requests.length,
      trustedTypes: state.trustedTypes ? "supported" : "unsupported",
      htmlSink: state.sink ? "accepted" : "blocked",
      trustedKeyboardAndContext: protectedBuild,
      editableExemptions: protectedBuild,
      runtimeIntegrity: protectedBuild,
      pageErrors: errors.length,
    };
  } finally {
    await context.close();
  }
}

export async function verifyConsumerGuards({ directory, url, command }) {
  const artifacts = await inspectBuild(directory);
  for (const [name, plugins] of [
    ["baseline", "[]"],
    [
      "opt-in",
      "[webguardApp({runtime:{devtools:{blockShortcuts:true,blockContextMenu:true}}})]",
    ],
  ]) {
    const config = `vite.${name}.config.mjs`;
    await writeFile(
      join(directory, config),
      `import {defineConfig} from 'vite';import {webguardApp} from 'uulab-webguard';export default defineConfig({plugins:${plugins}});\n`,
    );
    await command(
      process.execPath,
      [
        join(directory, "node_modules/vite/bin/vite.js"),
        "build",
        "--config",
        config,
        "--outDir",
        `dist-${name}`,
      ],
      directory,
    );
  }
  const servers = [],
    matrix = [];
  try {
    const baseline = await staticHost(
      join(directory, "dist-baseline"),
      servers,
    );
    const strict = await staticHost(join(directory, "dist"), servers);
    const optIn = await staticHost(join(directory, "dist-opt-in"), servers);
    for (const [name, engine] of Object.entries({
      chromium,
      firefox,
      webkit,
    })) {
      const browser = await engine.launch({ headless: true });
      try {
        for (const [host, target, options] of [
          ["unprotected-static", baseline, { protectedBuild: false }],
          ["strict-meta-only", strict, { protectedBuild: true }],
          ["opt-in-meta-only", optIn, { protectedBuild: true, optIn: true }],
          [
            "protected-preview",
            url,
            { protectedBuild: true, httpHeaders: true },
          ],
        ]) {
          const result = await exercise(browser, target, options);
          matrix.push({
            engine: name,
            version: browser.version(),
            host,
            ...result,
          });
          console.log(`Installed guard checks passed: ${name} ${host}`);
        }
        const context = await browser.newContext();
        try {
          let intercepted = 0;
          await context.route(`${strict}/${artifacts.entry}`, async (route) => {
            intercepted++;
            await route.fulfill({
              status: 200,
              contentType: "text/javascript",
              body: 'document.documentElement.dataset.tampered="executed";',
            });
          });
          const page = await context.newPage();
          await page.addInitScript(() => {
            window.addEventListener(
              "error",
              (event) => {
                if (event.target instanceof window.HTMLScriptElement)
                  document.documentElement.dataset.sriRejected = "true";
              },
              true,
            );
          });
          await page.goto(strict);
          await page.waitForFunction(
            () => document.documentElement.dataset.sriRejected === "true",
            undefined,
            { timeout: 12000 },
          );
          check(
            intercepted === 1 &&
              (await page.locator("#observed").textContent()) === "" &&
              !(await page.evaluate(
                () => document.documentElement.dataset.tampered,
              )),
            "Tampered SRI entry executed",
          );
          matrix.push({
            engine: name,
            version: browser.version(),
            host: "tampered-entry",
            sriRejected: true,
            automaticSdkRan: false,
          });
        } finally {
          await context.close();
        }
      } finally {
        await browser.close();
      }
    }
    return { artifacts, browserMatrix: matrix };
  } finally {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve, reject) => {
            server.closeAllConnections();
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  }
}
