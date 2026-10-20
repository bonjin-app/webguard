import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
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
let registry = false,
  tarball,
  vite = "8.3.4";
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--registry") registry = true;
  else if (args[index] === "--tarball") tarball = resolve(args[++index] ?? "");
  else if (args[index] === "--vite") vite = args[++index];
  else if (!args[index].startsWith("-") && !tarball)
    tarball = resolve(args[index]);
  else
    throw new Error(
      "Usage: node scripts/verify-npm-consumer.mjs (--tarball PATH | --registry) [--vite VERSION]",
    );
}
check(
  Boolean(registry) !== Boolean(tarball),
  "Choose exactly one of --tarball PATH or --registry",
);
check(/^\d+\.\d+\.\d+$/.test(vite ?? ""), "Use an exact Vite version");
const directory = await mkdtemp(join(tmpdir(), "webguard-npm-consumer-"));
let server, browser;
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
    `Fresh npm consumer: ${registry ? "registry uulab-webguard@0.1.0" : "reviewed tarball"} + Vite ${vite}`,
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
      registry ? "uulab-webguard@0.1.0" : tarball,
      `vite@${vite}`,
    ],
    directory,
  );
  const packageRoot = join(directory, "node_modules", "uulab-webguard");
  const metadata = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  check(
    metadata.name === "uulab-webguard" && metadata.version === "0.1.0",
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
  for (const name of [".", "./client", "./browser", "./headers"])
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
        /^dist\/(?:index|browser|client|headers)\.(?:js|d\.ts)$/.test(local) ||
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
  for (const name of ["browser.js", "client.js"]) {
    const text = await readFile(join(packageRoot, "dist", name), "utf8");
    check(
      !/(?:from\s*["']node:|require\(["'](?:node:|fs|path)|from\s*["'](?:vite|javascript-obfuscator))/.test(
        text,
      ),
      `Node dependency in ${name}`,
    );
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
  const installedServer = await import(
    pathToFileURL(join(packageRoot, "examples/server.mjs")).href
  );
  server = await installedServer.createProtectedServer(join(directory, "dist"));
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
  check(
    (await fetch(url + "/webguard-report.json")).status === 404,
    "Installed example server exposed its local build report",
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
  check(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  console.log(
    JSON.stringify({
      source: registry ? "registry" : "tarball",
      package: metadata.name,
      version: metadata.version,
      vite,
      automaticSdk: true,
      liveControls: true,
      strictHeaders: true,
      browserErrors: errors.length,
    }),
  );
} finally {
  await browser?.close();
  if (server)
    await new Promise((resolveClose, reject) => {
      server.closeAllConnections();
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  await rm(directory, { recursive: true, force: true });
}
