import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createRequire, builtinModules } from "node:module";
import { chromium } from "@playwright/test";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
function check(condition, message) {
  if (!condition) throw new Error(message);
}
async function command(file, args, cwd) {
  try {
    return await run(file, args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 180000,
    });
  } catch (error) {
    throw new Error(
      `${file} ${args.join(" ")} failed\n${error.stdout ?? ""}\n${error.stderr ?? error.message}`,
      { cause: error },
    );
  }
}
const args = process.argv.slice(2);
const candidate = JSON.parse(
  await readFile(
    new URL("../packages/npm/package.json", import.meta.url),
    "utf8",
  ),
);
let registry = false,
  tarball,
  vite = "8.3.4";
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--registry") registry = true;
  else if (args[index] === "--prepared") {
    const record = JSON.parse(
      await readFile(
        new URL("../.npm-release/release.json", import.meta.url),
        "utf8",
      ),
    );
    check(
      record.name === candidate.name &&
        record.version === candidate.version &&
        record.filename === `${candidate.name}-${candidate.version}.tgz`,
      "Prepared release differs from package metadata",
    );
    tarball = fileURLToPath(
      new URL(`../.npm-release/${record.filename}`, import.meta.url),
    );
  } else if (args[index] === "--tarball")
    tarball = resolve(args[++index] ?? "");
  else if (args[index] === "--vite") vite = args[++index];
  else if (!args[index].startsWith("-") && !tarball)
    tarball = resolve(args[index]);
  else
    throw new Error(
      "Usage: node scripts/verify-npm-consumer.mjs (--prepared | --tarball PATH | --registry) [--vite VERSION]",
    );
}
check(
  Boolean(registry) !== Boolean(tarball),
  "Choose exactly one of --tarball PATH or --registry",
);
check(/^\d+\.\d+\.\d+$/.test(vite ?? ""), "Use an exact Vite version");
const directory = await mkdtemp(join(tmpdir(), "webguard-npm-consumer-"));
let server, serverProcess, browser;
try {
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "webguard-external-consumer",
      private: true,
      type: "module",
    }),
  );
  console.log(
    `Fresh npm consumer: ${registry ? `registry ${candidate.name}@${candidate.version}` : "reviewed tarball"} + Vite ${vite}`,
  );
  await command(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--save-exact",
      "--registry=https://registry.npmjs.org",
      registry ? `${candidate.name}@${candidate.version}` : tarball,
      `vite@${vite}`,
      "@types/node@22.18.0",
    ],
    directory,
  );
  const packageRoot = join(directory, "node_modules", "uulab-webguard");
  const metadata = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  check(
    metadata.name === candidate.name && metadata.version === candidate.version,
    "Unexpected installed package identity",
  );
  check(
    !Object.keys({
      ...metadata.dependencies,
      ...metadata.devDependencies,
      ...metadata.peerDependencies,
      ...metadata.optionalDependencies,
    }).some((name) => name.startsWith("@webguard/")),
    "Internal workspace dependency published",
  );
  check(
    !Object.keys(metadata.scripts ?? {}).some((name) =>
      /^(?:preinstall|install|postinstall|prepare|prepack)$/.test(name),
    ),
    "Unexpected installation or packing hook",
  );
  for (const name of [
    ".",
    "./client",
    "./browser",
    "./headers",
    "./verify",
    "./server",
  ])
    check(
      metadata.exports?.[name]?.types && metadata.exports[name].import,
      `Missing public export ${name}`,
    );
  async function inspect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) {
        await inspect(full);
        continue;
      }
      check(!entry.name.endsWith(".map"), "Source map in published package");
      if (/\.(?:js|mjs|ts)$/.test(entry.name)) {
        const text = await readFile(full, "utf8");
        check(
          !/(?:from\s*|import\s*\(|require\s*\(|import\.meta\.resolve\s*\()\s*["']@webguard\//.test(
            text,
          ),
          `Unresolved internal reference in ${entry.name}`,
        );
      }
    }
  }
  const packageFiles = await readdir(packageRoot, {
    recursive: true,
    withFileTypes: true,
  });
  const allowedRoot = new Set([
    "package.json",
    "README.md",
    "INSTALL.ko.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ]);
  for (const entry of packageFiles) {
    const local = relative(packageRoot, join(entry.parentPath, entry.name))
      .split(sep)
      .join("/");
    check(!entry.isSymbolicLink(), `Symbolic link in public package: ${local}`);
    if (entry.isDirectory()) {
      check(
        local === "dist" || local === "examples",
        `Unexpected package directory: ${local}`,
      );
      continue;
    }
    check(
      allowedRoot.has(local) ||
        /^dist\/(?:index|browser|client|headers|verify|check|server|serve)\.(?:js|d\.ts)$/.test(
          local,
        ) ||
        local === "examples/server.mjs",
      `Unexpected public package file: ${local}`,
    );
  }
  const lock = JSON.parse(
    await readFile(join(directory, "package-lock.json"), "utf8"),
  );
  check(
    !Object.keys(lock.packages ?? {}).some((path) =>
      path.includes("node_modules/@webguard/"),
    ),
    "Consumer installed an internal workspace package",
  );
  await inspect(join(packageRoot, "dist"));
  const builtinSpecifiers = [
    ...new Set(builtinModules.map((name) => name.replace(/^node:/, ""))),
  ];
  const escapedBuiltins = builtinSpecifiers
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const nodeImport = new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*(?:\\(\\s*)?|\\brequire\\s*\\(\\s*)["'](?:node:|(?:${escapedBuiltins}|vite|javascript-obfuscator)["'])`,
  );
  for (const name of ["browser.js", "client.js"]) {
    const text = await readFile(join(packageRoot, "dist", name), "utf8");
    check(!nodeImport.test(text), `Node dependency in ${name}`);
  }
  await writeFile(
    join(directory, "vite.config.mjs"),
    "import {defineConfig} from 'vite'; import {webguardApp} from 'uulab-webguard'; export default defineConfig({plugins:[webguardApp()]});\n",
  );
  await writeFile(
    join(directory, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><title>Npm consumer</title></head><body><p id="status">starting</p><button id="toggle" disabled>Toggle shortcuts</button><button id="counter">Count: 0</button><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(
    join(directory, "main.js"),
    `import {getWebGuard} from 'uulab-webguard/client'; import {WebGuard} from 'uulab-webguard/browser'; import {createSecurityHeaders} from 'uulab-webguard/headers';
let count=0;const counter=document.querySelector('#counter');counter.addEventListener('click',()=>{counter.textContent='Count: '+ ++count;});
const status=document.querySelector('#status'),toggle=document.querySelector('#toggle');
function ready(){const guard=getWebGuard();if(!guard){requestAnimationFrame(ready);return;}status.textContent=JSON.stringify(guard.getOptions());toggle.disabled=false;toggle.addEventListener('click',()=>{const enabled=!guard.getOptions().devtools.blockShortcuts;guard.update({devtools:{blockShortcuts:enabled,blockContextMenu:enabled}});status.textContent=JSON.stringify(guard.getOptions());});}
if(typeof WebGuard.init!=='function'||!createSecurityHeaders()['Content-Security-Policy'])throw new Error('Missing browser exports');ready();\n`,
  );
  await writeFile(
    join(directory, "consumer.ts"),
    `import {webguardApp,webguard,type WebGuardAppOptions} from 'uulab-webguard'; import {getWebGuard} from 'uulab-webguard/client'; import {WebGuard,type WebGuardOptions} from 'uulab-webguard/browser'; import {createSecurityHeaders,type SecurityHeadersOptions} from 'uulab-webguard/headers';
const config:WebGuardAppOptions={preset:'strict',runtime:{devtools:{blockShortcuts:false}}};webguardApp(config);webguard({preset:'standard'});getWebGuard()?.update({devtools:{blockShortcuts:true}});const runtime:WebGuardOptions={devtools:{response:'monitor'}};WebGuard.init(runtime).destroy();const headers:SecurityHeadersOptions={trustedTypes:'report-only'};createSecurityHeaders(headers);
import {checkDeployment} from 'uulab-webguard/verify'; void checkDeployment;
import {createProtectedServer} from 'uulab-webguard/server'; import type {Server} from 'node:http'; const createServer:(directory:string)=>Promise<Server>=createProtectedServer;void createServer;
// @ts-expect-error The public server accepts a directory string.
createProtectedServer(42);
createProtectedServer('dist').then(server=>{
// @ts-expect-error Returned values expose the Node Server API, not arbitrary methods.
server.nonexistentWebGuardServerMethod();
});
// @ts-expect-error The internal runtime resolver is not part of the public API.
webguardApp({resolveRuntime:()=>'/tmp/runtime.js'});
// @ts-expect-error Shortcut options are nested.
WebGuard.init({blockShortcuts:true});\n`,
  );
  await command(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--lib",
      "ES2022,DOM",
      "consumer.ts",
    ],
    directory,
  );
  console.log("Installed public exports and consumer declarations verified");
  await command(
    process.execPath,
    [join(directory, "node_modules/vite/bin/vite.js"), "build"],
    directory,
  );
  const report = JSON.parse(
    await readFile(join(directory, "dist/webguard-report.json"), "utf8"),
  );
  check(report.preset === "strict", "Default application preset changed");
  const headers = JSON.parse(
    await readFile(join(directory, "dist/webguard-headers.json"), "utf8"),
  );
  check(
    headers["Content-Security-Policy"].includes(
      "require-trusted-types-for 'script'",
    ),
    "Default header policy missing Trusted Types",
  );
  check(
    (await readFile(join(directory, "dist/_headers"), "utf8")).includes(
      "Content-Security-Policy",
    ),
    "Host header artifact missing",
  );
  const { parse } = await import(
    pathToFileURL(
      createRequire(join(packageRoot, "package.json")).resolve("parse5"),
    ).href
  );
  function checkMeta(html, { enabled = true, trustedTypes = true } = {}) {
    const nodes = [];
    function walk(node) {
      nodes.push(node);
      for (const child of node.childNodes ?? []) walk(child);
    }
    walk(parse(html));
    const attr = (node, name) =>
      node.attrs?.find((attribute) => attribute.name === name)?.value;
    const policies = nodes.filter(
      (node) =>
        node.tagName === "meta" &&
        attr(node, "http-equiv")?.toLowerCase() === "content-security-policy",
    );
    if (!enabled) {
      check(
        policies.length === 0,
        "headers:false still injected a CSP meta policy",
      );
      return;
    }
    check(
      policies.length === 1,
      "Built HTML requires exactly one enforced CSP meta policy",
    );
    const meta = policies[0];
    check(meta.parentNode?.tagName === "head", "CSP meta must be inside head");
    const firstScript = nodes.findIndex((node) => node.tagName === "script");
    check(
      firstScript >= 0 && nodes.indexOf(meta) < firstScript,
      "CSP meta must precede every script",
    );
    const policy = attr(meta, "content") ?? "";
    check(
      policy.includes("default-src 'none'") &&
        policy.includes("connect-src 'self'"),
      "CSP meta missing same-origin resource restrictions",
    );
    if (trustedTypes)
      check(
        policy.includes("require-trusted-types-for 'script'"),
        "Default CSP meta missing enforced Trusted Types",
      );
    else
      check(
        !/(?:require-trusted-types-for|(?:^|;)\s*trusted-types(?:\s|$))/i.test(
          policy,
        ),
        "Report-only Trusted Types became enforced through meta",
      );
  }
  checkMeta(await readFile(join(directory, "dist/index.html"), "utf8"));
  for (const variant of [
    {
      name: "without-headers",
      options: "{headers:false}",
      enabled: false,
      trustedTypes: false,
    },
    {
      name: "report-only",
      options: "{headers:{trustedTypes:'report-only'}}",
      enabled: true,
      trustedTypes: false,
    },
  ]) {
    const configFile = `vite.${variant.name}.config.mjs`;
    await writeFile(
      join(directory, configFile),
      `import {defineConfig} from 'vite';import {webguardApp} from 'uulab-webguard';export default defineConfig({plugins:[webguardApp(${variant.options})]});\n`,
    );
    await command(
      process.execPath,
      [
        join(directory, "node_modules/vite/bin/vite.js"),
        "build",
        "--config",
        configFile,
        "--outDir",
        `dist-${variant.name}`,
      ],
      directory,
    );
    checkMeta(
      await readFile(
        join(directory, `dist-${variant.name}/index.html`),
        "utf8",
      ),
      variant,
    );
  }
  await writeFile(
    join(directory, "server-api.mjs"),
    "export {createProtectedServer} from 'uulab-webguard/server';\n",
  );
  const installedServer = await import(
    pathToFileURL(join(directory, "server-api.mjs")).href
  );
  server = await installedServer.createProtectedServer(join(directory, "dist"));
  check(!server.listening, "Public server API unexpectedly started listening");
  await new Promise((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  check(address && typeof address !== "string", "Missing consumer port");
  const url = `http://127.0.0.1:${address.port}`;
  const response = await fetch(url);
  check(
    response.headers.get("content-security-policy") ===
      headers["Content-Security-Policy"],
    "Real server did not apply generated headers",
  );
  for (const path of [
    "webguard-report.json",
    "webguard-headers.json",
    "_headers",
    "src/main.ts",
    "package.json",
    ".env",
    "vite.config.mjs",
  ])
    check(
      (await fetch(`${url}/${path}`)).status === 404,
      `Public server exposed a private URL: ${path}`,
    );
  check(
    metadata.bin?.["webguard-serve"] === "./dist/serve.js",
    "Missing public protected-server command",
  );
  await new Promise((resolveClose, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  server = undefined;
  let serveDiagnostics = "";
  serverProcess = spawn(
    join(directory, "node_modules/.bin/webguard-serve"),
    ["dist", "--port", String(address.port)],
    { cwd: directory, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serveSpawnError;
  serverProcess.once("error", (error) => {
    serveSpawnError = error;
  });
  serverProcess.stdout.on("data", (bytes) => {
    serveDiagnostics += String(bytes);
  });
  serverProcess.stderr.on("data", (bytes) => {
    serveDiagnostics += String(bytes);
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (serveSpawnError || serverProcess.exitCode !== null)
      throw new Error(
        `Installed server CLI exited before readiness: ${serveSpawnError?.message ?? serveDiagnostics}`,
      );
    try {
      if (
        (await fetch(url, { signal: globalThis.AbortSignal.timeout(300) }))
          .status === 200
      ) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for actual HTTP readiness. */
    }
    await new Promise((resolveReady) => setTimeout(resolveReady, 50));
  }
  check(ready, `Installed server CLI did not listen: ${serveDiagnostics}`);
  const served = await fetch(url);
  check(
    served.headers.get("content-security-policy") ===
      headers["Content-Security-Policy"],
    "Installed server CLI omitted generated CSP",
  );
  check(
    served.headers.get("x-content-type-options") === "nosniff",
    "Installed server CLI omitted nosniff",
  );
  for (const path of [
    "webguard-report.json",
    "webguard-headers.json",
    "_headers",
    "src/main.ts",
    "package.json",
    ".env",
  ])
    check(
      (await fetch(`${url}/${path}`)).status === 404,
      `Installed server CLI exposed a private URL: ${path}`,
    );
  check(
    metadata.bin?.["webguard-check"] === "./dist/check.js",
    "Missing public checker command",
  );
  const checked = await command(
    join(directory, "node_modules/.bin/webguard-check"),
    ["dist", "--url", url],
    directory,
  );
  const deployment = JSON.parse(checked.stdout);
  check(
    deployment.valid === true &&
      deployment.checked > 4 &&
      deployment.errors.length === 0,
    "Installed CLI failed to verify actual protected deployment",
  );
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.locator("#toggle").waitFor();
  await page.waitForFunction(() => !document.querySelector("#toggle").disabled);
  const defaults = JSON.parse(await page.locator("#status").textContent());
  check(
    defaults.preset === "strict" &&
      defaults.devtools.detect === true &&
      defaults.devtools.blockShortcuts !== true,
    "Automatic SDK defaults changed",
  );
  const dispatch = () =>
    page.evaluate(() =>
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "F12",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  check(await dispatch(), "Shortcuts blocked before explicit opt-in");
  await page.locator("#toggle").click();
  check(!(await dispatch()), "Live enable did not block F12");
  check(
    !(await page.evaluate(() =>
      document.dispatchEvent(
        new window.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
        }),
      ),
    )),
    "Live enable did not block context menu",
  );
  await page.locator("#toggle").click();
  check(await dispatch(), "Live disable did not release F12");
  await page.locator("#counter").click();
  check(
    (await page.locator("#counter").textContent()) === "Count: 1",
    "Protected interaction changed",
  );
  let nonselfRequests = 0;
  await page.route("https://webguard-consumer.invalid/**", async (route) => {
    nonselfRequests++;
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "unexpected nonself request",
    });
  });
  const policyBlocks = await page.evaluate(async () => {
    let network = false,
      sink = false;
    try {
      await fetch("https://webguard-consumer.invalid/private");
    } catch {
      network = true;
    }
    try {
      document.createElement("div").innerHTML = "<p>Untrusted sink fixture</p>";
    } catch {
      sink = true;
    }
    return { network, sink };
  });
  check(
    policyBlocks.network && policyBlocks.sink && nonselfRequests === 0,
    "Default browser policy did not block nonself fetch and string HTML sinks",
  );
  check(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  await browser.close();
  browser = undefined;
  await new Promise((resolveClose) => {
    serverProcess.once("close", resolveClose);
    serverProcess.kill("SIGTERM");
  });
  serveDiagnostics = "";
  serveSpawnError = undefined;
  serverProcess = spawn(
    process.execPath,
    [
      join(directory, "node_modules/vite/bin/vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(address.port),
      "--strictPort",
    ],
    { cwd: directory, stdio: ["ignore", "pipe", "pipe"] },
  );
  serverProcess.once("error", (error) => {
    serveSpawnError = error;
  });
  serverProcess.stdout.on("data", (bytes) => {
    serveDiagnostics += String(bytes);
  });
  serverProcess.stderr.on("data", (bytes) => {
    serveDiagnostics += String(bytes);
  });
  ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (serveSpawnError || serverProcess.exitCode !== null)
      throw new Error(
        `Installed Vite preview exited before readiness: ${serveSpawnError?.message ?? serveDiagnostics}`,
      );
    try {
      if (
        (await fetch(url, { signal: globalThis.AbortSignal.timeout(300) }))
          .status === 200
      ) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the installed preview to listen. */
    }
    await new Promise((resolveReady) => setTimeout(resolveReady, 50));
  }
  check(ready, `Installed Vite preview did not listen: ${serveDiagnostics}`);
  const preview = await fetch(url);
  check(
    preview.headers.get("content-security-policy") ===
      headers["Content-Security-Policy"],
    "Installed Vite preview omitted generated CSP",
  );
  check(
    preview.headers.get("x-content-type-options") === "nosniff",
    "Installed Vite preview omitted nosniff",
  );
  for (const path of [
    "webguard-report.json",
    "webguard-headers.json",
    "_headers",
    "src/main.ts",
    "package.json",
    ".env",
    "vite.config.mjs",
  ])
    check(
      (await fetch(`${url}/${path}`)).status === 404,
      `Installed Vite preview exposed a private URL: ${path}`,
    );
  console.log(
    JSON.stringify({
      source: registry ? "registry" : "tarball",
      package: metadata.name,
      version: metadata.version,
      vite,
      automaticSdk: true,
      liveControls: true,
      strictHeaders: true,
      deploymentCheck: true,
      publicServerApi: true,
      installedServerCli: true,
      protectedPreview: true,
      cspMeta: true,
      headerOptOut: true,
      reportOnlyMeta: true,
      browserErrors: errors.length,
    }),
  );
} finally {
  await browser?.close();
  if (
    serverProcess?.pid &&
    serverProcess.exitCode === null &&
    serverProcess.signalCode === null
  ) {
    await new Promise((resolveClose) => {
      serverProcess.once("close", resolveClose);
      serverProcess.kill("SIGTERM");
    });
  }
  if (server)
    await new Promise((resolveClose, reject) => {
      server.closeAllConnections();
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  await rm(directory, { recursive: true, force: true });
}
