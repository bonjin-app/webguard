import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire, isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as bundle } from "esbuild";
import { build } from "vite";
import { chromium, firefox, webkit } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const probe = "https://meta-guard-fixture.invalid/probe";
const temporary = await mkdtemp(join(tmpdir(), "webguard-meta-guards-"));
const servers = [];
let browser;
function check(condition, message) {
  if (!condition) throw new Error(message);
}
async function staticHost(directory) {
  const files = new Map();
  for (const entry of await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !/\.(?:html|js|mjs|css)$/.test(entry.name)) continue;
    const file = join(entry.parentPath, entry.name),
      path = "/" + relative(directory, file).split(sep).join("/");
    files.set(path, await readFile(file));
  }
  const server = createServer((request, response) => {
    const raw = request.url ?? "",
      path = raw.split("?")[0];
    const file = path === "/" ? "/index.html" : path;
    const body = files.get(file);
    if (!["GET", "HEAD"].includes(request.method) || !body) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    // Deliberately no HTTP CSP: this check must isolate enforcement by the HTML meta.
    response.writeHead(200, {
      "Content-Type": file.endsWith(".html")
        ? "text/html; charset=utf-8"
        : file.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/javascript; charset=utf-8",
      "Content-Length": body.byteLength,
    });
    response.end(request.method === "HEAD" ? undefined : body);
  });
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  check(
    address && typeof address !== "string",
    "Static host has no loopback address",
  );
  return `http://127.0.0.1:${address.port}`;
}
async function readObserved(page) {
  return JSON.parse(await page.locator("#observed").textContent());
}
async function exercise(browser, url, protectedBuild) {
  const context = await browser.newContext();
  const externalRequests = [],
    errors = [];
  try {
    await context.route("**/*", async (route) => {
      const destination = route.request().url();
      if (new URL(destination).origin === url) {
        await route.continue();
        return;
      }
      externalRequests.push(destination);
      if (destination === probe)
        await route.fulfill({
          status: 200,
          contentType: "text/plain",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "fixture-ok",
        });
      else await route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const navigation = await page.goto(url);
    const headers = navigation.headers();
    check(
      !headers["content-security-policy"] &&
        !headers["content-security-policy-report-only"],
      "Fixture unexpectedly supplied an HTTP CSP header",
    );
    await page.waitForFunction(
      () => !document.querySelector("#connect").disabled,
    );
    await page.locator("#connect").click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#observed").textContent).network !==
        null,
    );
    if (protectedBuild)
      await page.waitForFunction(() =>
        JSON.parse(document.querySelector("#observed").textContent).events.some(
          (event) => event.directive === "connect-src",
        ),
      );
    await page.locator("#html").click();
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector("#observed").textContent).html !==
        null,
    );
    const initial = await readObserved(page);
    if (protectedBuild && initial.trustedTypesSupported)
      await page.waitForFunction(() =>
        JSON.parse(document.querySelector("#observed").textContent).events.some(
          (event) => event.directive === "require-trusted-types-for",
        ),
      );
    const observed = await readObserved(page);
    if (protectedBuild) {
      check(
        observed.network.outcome === "blocked",
        "Meta CSP did not reject the app fetch",
      );
      check(
        observed.events.some(
          (event) =>
            event.directive === "connect-src" &&
            event.disposition === "enforce",
        ),
        "Missing enforced connect-src violation",
      );
      check(
        externalRequests.length === 0,
        "Protected page sent an external network request",
      );
      if (observed.trustedTypesSupported) {
        check(
          observed.html.outcome === "TypeError" && !observed.html.nodePresent,
          "Trusted Types did not block the app innerHTML assignment",
        );
        check(
          observed.events.some(
            (event) =>
              event.directive === "require-trusted-types-for" &&
              event.disposition === "enforce",
          ),
          "Missing enforced Trusted Types violation",
        );
      } else
        check(
          observed.html.outcome === "accepted" && observed.html.nodePresent,
          "Browser without Trusted Types unexpectedly failed the harmless DOM operation",
        );
    } else {
      check(
        observed.network.outcome === "accepted" &&
          observed.network.status === 200 &&
          observed.network.body === "fixture-ok",
        "Unprotected network baseline did not succeed",
      );
      check(
        externalRequests.length === 1 && externalRequests[0] === probe,
        "Baseline did not reach exactly the fixed benign fixture",
      );
      check(
        observed.html.outcome === "accepted" && observed.html.nodePresent,
        "Unprotected DOM baseline did not succeed",
      );
      check(
        observed.events.length === 0,
        "Unprotected baseline reported a CSP violation",
      );
    }
    check(errors.length === 0, `Unexpected page errors: ${errors.join("; ")}`);
    return {
      connect: observed.network.outcome,
      externalRequests: externalRequests.length,
      html: observed.html.outcome,
      trustedTypes: observed.trustedTypesSupported
        ? "supported"
        : "unsupported",
      violations: observed.events.map((event) => event.directive),
      pageErrors: errors.length,
    };
  } finally {
    await context.close();
  }
}
try {
  const pluginFile = join(temporary, "source-plugin.mjs");
  // Bundle current internal source, not a possibly stale published or workspace dist.
  await bundle({
    entryPoints: [join(root, "packages/vite-plugin/src/index.ts")],
    outfile: pluginFile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    tsconfig: join(root, "tsconfig.json"),
    plugins: [
      {
        name: "external-third-party-source-dependencies",
        setup(build) {
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.path.startsWith("@webguard/")) return;
            if (isBuiltin(args.path))
              return { path: args.path, external: true };
            return {
              path: createRequire(args.importer || import.meta.url).resolve(
                args.path,
              ),
              external: true,
            };
          });
        },
      },
    ],
  });
  const { webguardApp } = await import(pathToFileURL(pluginFile).href);
  const app = join(temporary, "app");
  await mkdir(app);
  await writeFile(
    join(app, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><title>Meta-only CSP fixture</title></head><body><button id="connect" disabled>Fetch fixed fixture</button><button id="html" disabled>Assign harmless HTML</button><div id="target"></div><pre id="observed">{}</pre><script type="module" src="/app.js"></script></body></html>',
  );
  await writeFile(
    join(app, "app.js"),
    `const observed={network:null,html:null,events:[],trustedTypesSupported:typeof globalThis.trustedTypes?.createPolicy==='function'};
const output=document.querySelector('#observed'),target=document.querySelector('#target'),connect=document.querySelector('#connect'),html=document.querySelector('#html');
function render(){output.textContent=JSON.stringify(observed);}
document.addEventListener('securitypolicyviolation',event=>{observed.events.push({directive:event.effectiveDirective,disposition:event.disposition});render();});
connect.addEventListener('click',async()=>{try{const response=await fetch(${JSON.stringify(probe)},{cache:'no-store'});observed.network={outcome:'accepted',status:response.status,body:await response.text()};}catch(error){observed.network={outcome:'blocked',error:error.name};}render();});
html.addEventListener('click',()=>{try{target.innerHTML='<strong>Harmless fixed probe</strong>';observed.html={outcome:'accepted',nodePresent:Boolean(target.querySelector('strong'))};}catch(error){observed.html={outcome:error.name,nodePresent:Boolean(target.querySelector('strong'))};}render();});
render();connect.disabled=false;html.disabled=false;`,
  );
  const protectedDirectory = join(temporary, "protected"),
    baselineDirectory = join(temporary, "baseline");
  await build({
    root: app,
    configFile: false,
    logLevel: "silent",
    plugins: [webguardApp({ runtime: false })],
    build: { outDir: protectedDirectory, emptyOutDir: true },
  });
  await build({
    root: app,
    configFile: false,
    logLevel: "silent",
    plugins: [],
    build: { outDir: baselineDirectory, emptyOutDir: true },
  });
  const protectedHtml = await readFile(
    join(protectedDirectory, "index.html"),
    "utf8",
  );
  check(
    protectedHtml.includes("Content-Security-Policy") &&
      protectedHtml.includes("require-trusted-types-for"),
    "Protected build lacks the enforced CSP meta",
  );
  check(
    !(await readFile(join(baselineDirectory, "index.html"), "utf8")).includes(
      "Content-Security-Policy",
    ),
    "Baseline accidentally contains CSP",
  );
  const protectedUrl = await staticHost(protectedDirectory),
    baselineUrl = await staticHost(baselineDirectory);
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    browser = await engine.launch({ headless: true });
    const baseline = await exercise(browser, baselineUrl, false),
      protectedResult = await exercise(browser, protectedUrl, true);
    console.log(
      JSON.stringify({
        engine: name,
        version: browser.version(),
        httpCspHeaders: false,
        baseline,
        protected: protectedResult,
      }),
    );
    await browser.close();
    browser = undefined;
  }
} finally {
  await browser?.close();
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  await rm(temporary, { recursive: true, force: true });
}
