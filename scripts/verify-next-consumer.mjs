import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
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
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium, firefox, webkit } from "@playwright/test";
import { JSDOM } from "jsdom";

const run = promisify(execFile);
const args = process.argv.slice(2);
const value = (flag) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
if (!value("--tarball"))
  throw new Error(
    "Usage: node scripts/verify-next-consumer.mjs --tarball PATH [--evidence PATH] [--keep]",
  );
const tarball = resolve(value("--tarball"));
const evidence = value("--evidence") ? resolve(value("--evidence")) : undefined;
const repository = fileURLToPath(new URL("../", import.meta.url));
const project = await mkdtemp(join(tmpdir(), "webguard-next-consumer-"));
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
    "Next App Router production Webpack browser chunks; SSR/RSC/API code and CSP are unchanged; public/ and inline Flight data are not obfuscated",
};
const save = async () => {
  if (evidence) {
    await mkdir(dirname(evidence), { recursive: true });
    await writeFile(evidence, JSON.stringify(result, null, 2) + "\n");
  }
};
async function command(parameters, timeout = 600000) {
  const output = await run(parameters[0], parameters.slice(1), {
    cwd: project,
    timeout,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  }).catch((error) => {
    throw new Error(
      `${parameters.join(" ")} failed\n${error.stdout ?? ""}\n${error.stderr ?? error.message}`,
      { cause: error },
    );
  });
  return output;
}
async function files(directory, prefix = "") {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true }))
    if (entry.isDirectory())
      found.push(
        ...(await files(
          join(directory, entry.name),
          prefix + entry.name + "/",
        )),
      );
    else found.push(prefix + entry.name);
  return found;
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
  await cp(join(repository, "examples/next-ssr"), project, {
    recursive: true,
    filter: (path) =>
      !path.includes("node_modules") && !path.includes("/.next"),
  });
  const metadata = JSON.parse(
    await readFile(join(project, "package.json"), "utf8"),
  );
  metadata.dependencies["uulab-webguard"] = `file:${tarball}`;
  await writeFile(
    join(project, "package.json"),
    JSON.stringify(metadata, null, 2),
  );
  await command([
    "npm",
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ]);
  for (const name of ["next", "react", "react-dom", "uulab-webguard"])
    result.versions[name] = JSON.parse(
      await readFile(
        join(project, "node_modules", name, "package.json"),
        "utf8",
      ),
    ).version;
  assert.equal(
    existsSync(join(project, "node_modules/vite")),
    false,
    "Next entry must not install or import Vite",
  );
  result.checks.noViteDependency = true;
  await writeFile(
    join(project, "types.ts"),
    `import type { NextConfig } from 'next';
import { withWebGuard, type WebGuardNextOptions } from 'uulab-webguard/next';
const options: WebGuardNextOptions = { preset: 'strict', runtime: { devtools: { detect: false } } };
const input: NextConfig = { reactStrictMode: true };
const config: NextConfig = withWebGuard(input, options);
void config;
`,
  );
  await command([
    process.execPath,
    join(repository, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--skipLibCheck",
    "--strict",
    "types.ts",
  ]);
  await rm(join(project, "types.ts"));
  result.checks.nextConfigTypes = true;
  for (const flags of [["--turbopack"], ["--turbo"], []])
    await assert.rejects(
      () =>
        command([
          process.execPath,
          join(project, "node_modules/next/dist/bin/next"),
          "build",
          ...flags,
        ]),
      /WebGuard Next.*--webpack/s,
    );
  result.checks.unsupportedProductionBundlersRejected = true;
  const built = await command(["npm", "run", "build"]);
  const tierLine = built.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("[WebGuard Next] "));
  assert.ok(
    tierLine,
    "Production compiler must report actual chunk tiers and byte sizes",
  );
  const tierReport = JSON.parse(tierLine.slice("[WebGuard Next] ".length));
  assert.equal(tierReport.preset, "strict");
  assert.equal(tierReport.frameworkPreset, "standard");
  assert.ok(
    tierReport.assets.some(
      (asset) => asset.origin === "framework" && asset.preset === "standard",
    ),
  );
  assert.ok(
    tierReport.assets.some(
      (asset) =>
        asset.origin === "application-or-unknown" && asset.preset === "strict",
    ),
  );
  for (const asset of tierReport.assets)
    if (asset.origin !== "framework") assert.equal(asset.preset, "strict");
  result.protectionTiers = {
    policy:
      "Conclusive third-party module graphs use Standard; app, SDK, mixed and unknown chunks keep Strict",
    counts: Object.fromEntries(
      ["strict", "standard", "basic"].map((preset) => [
        preset,
        tierReport.assets.filter((asset) => asset.preset === preset).length,
      ]),
    ),
    inputBytes: tierReport.assets.reduce(
      (sum, asset) => sum + asset.inputBytes,
      0,
    ),
    outputBytes: tierReport.assets.reduce(
      (sum, asset) => sum + asset.outputBytes,
      0,
    ),
    assets: tierReport.assets,
    measurement:
      "Uncompressed compiled JavaScript bytes before/after obfuscation; this is not a startup or network performance benchmark",
  };
  result.checks.productionBuild = true;
  const staticFiles = await files(join(project, ".next/static"));
  assert.ok(
    !staticFiles.some((file) => /\.map$/i.test(file)),
    "public static tree must not contain maps",
  );
  const chunks = [];
  for (const file of staticFiles.filter(
    (file) => /\.js$/.test(file) && !/_buildManifest|_ssgManifest/.test(file),
  )) {
    const bytes = await readFile(join(project, ".next/static", file));
    const code = bytes.toString("utf8");
    const tier = tierReport.assets.find(
      (asset) => asset.path === "static/" + file,
    );
    assert.ok(tier, `Missing compiler tier for ${file}`);
    assert.equal(bytes.byteLength, tier.outputBytes);
    assert.match(
      code,
      /_0x[\da-f]+/i,
      `Expected transformed browser chunk ${file}`,
    );
    assert.doesNotMatch(code, /sourceMappingURL\s*=/);
    chunks.push({
      path: file,
      bytes: bytes.byteLength,
      sha384: createHash("sha384").update(bytes).digest("hex"),
      preset: tier.preset,
    });
  }
  assert.ok(chunks.length > 0);
  result.chunks = chunks;
  result.checks.browserChunksTransformed = true;
  result.checks.publicMapsAbsent = true;
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      join(project, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: project,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    },
  );
  server.stdout.on("data", (bytes) => {
    serverLog += bytes.toString();
  });
  server.stderr.on("data", (bytes) => {
    serverLog += bytes.toString();
  });
  const started = Date.now();
  while (true) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Wait for the owned server. */
    }
    if (server.exitCode !== null || Date.now() - started > 30000)
      throw new Error(`Next server did not start: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const response = await fetch(origin, {
    headers: { "x-webguard-proof": "request-specific-ssr" },
  });
  const html = await response.text();
  assert.match(html, /request-specific-ssr/);
  const policy = response.headers.get("content-security-policy");
  assert.match(
    policy,
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
  );
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  const nonce = policy.match(/'nonce-([^']+)'/)[1];
  const document = new JSDOM(html).window.document;
  const serverClass = document.querySelector("#counter").className;
  assert.match(serverClass, /^wg_[a-f0-9]{24}$/);
  assert.ok(document.scripts.length > 0);
  for (const script of document.scripts)
    assert.equal(
      script.getAttribute("nonce"),
      nonce,
      "Next bootstrap and chunks must retain the app nonce",
    );
  assert.notEqual(
    (await fetch(origin)).headers.get("content-security-policy"),
    policy,
    "Each document request needs a new nonce",
  );
  assert.deepEqual(await (await fetch(origin + "/api/quote")).json(), {
    source: "server",
    price: 9900,
  });
  result.checks.requestSpecificSSR = true;
  result.checks.apiUnchanged = true;
  result.checks.cspUnchanged = true;
  result.checks.requestNoncePropagated = true;
  result.checks.productionCSPWithoutUnsafeEvalOrInline = true;
  for (const engine of [chromium, firefox, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      const errors = [];
      const requests = [];
      const scripts = new Set();
      const browserResult = {
        engine: engine.name(),
        errors,
        failedRequests: requests,
      };
      result.browsers.push(browserResult);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("response", (response) => {
        if (new URL(response.url()).pathname.endsWith(".js"))
          scripts.add(new URL(response.url()).pathname);
        if (response.status() >= 400)
          requests.push({
            url: new URL(response.url()).pathname,
            status: response.status(),
          });
      });
      await page.goto(origin, { waitUntil: "networkidle" });
      await page
        .locator("#guard-status")
        .filter({ hasText: "active" })
        .waitFor();
      assert.equal(
        await page.locator("#counter").getAttribute("class"),
        serverClass,
        "SSR and hydrated CSS class must match",
      );
      await page
        .locator("#automatic-watch-state")
        .filter({ hasText: "watching" })
        .waitFor();
      assert.equal(
        await page
          .locator("#counter")
          .evaluate((node) => window.getComputedStyle(node).backgroundColor),
        "rgb(37, 99, 235)",
        "Opaque CSS Module must preserve styling",
      );
      await page.locator("#counter").click();
      await page.locator("#counter").filter({ hasText: "Count 1" }).waitFor();
      await page.locator("#lazy").click();
      await page
        .locator("#lazy-result")
        .filter({ hasText: "lazy-result:42" })
        .waitFor();
      await page.evaluate(() => {
        window.__webguardNavigationProof = "same-document";
      });
      await page.getByRole("link", { name: "다음 페이지" }).click();
      await page
        .getByRole("heading", { name: "클라이언트 이동 완료" })
        .waitFor();
      assert.equal(
        await page.evaluate(() => window.__webguardNavigationProof),
        "same-document",
      );
      await page.getByRole("link", { name: "처음으로" }).click();
      await page
        .locator("#guard-status")
        .filter({ hasText: "active" })
        .waitFor();
      await page.keyboard.press("F12");
      await page.locator("dialog[data-webguard-blocker][open]").waitFor();
      // Browser UI itself is outside SDK control; this proves the page response.
      for (const chunk of chunks.slice(0, 2))
        assert.equal(
          (await fetch(origin + "/_next/static/" + chunk.path + ".map")).status,
          404,
        );
      assert.deepEqual(requests, [], `${engine.name()} failed requests`);
      assert.deepEqual(errors, [], `${engine.name()} hydration/runtime errors`);
      Object.assign(browserResult, {
        hydration: true,
        opaqueCSSModuleSSR: true,
        opaqueCSSModuleStyle: true,
        counter: true,
        clientNavigation: true,
        lazyImport: true,
        autoSDK: true,
        automaticDebuggingWatch: true,
        shortcutPageResponse: true,
        fetchedScripts: [...scripts],
      });
      await save();
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
