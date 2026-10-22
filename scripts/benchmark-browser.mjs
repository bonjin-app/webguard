import { build, version as viteVersion } from "vite";
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir, platform, arch, cpus } from "node:os";
import { dirname, join, resolve, extname, relative, sep } from "node:path";
import { createProtectedServer } from "../examples/security-server/server.mjs";
import {
  javascriptSizes,
  cpuDelta,
  checkBudget,
  summarizeValues,
} from "./browser-benchmark-metrics.mjs";

const args = process.argv.slice(2);
let evidence = resolve("docs/evidence/benchmark-browser.json"),
  budgetPath;
for (let i = 0; i < args.length; i += 2) {
  if (!["--budget", "--evidence"].includes(args[i]) || !args[i + 1])
    throw new Error(
      "Usage: node scripts/benchmark-browser.mjs [--budget PATH] [--evidence PATH]",
    );
  if (args[i] === "--budget") budgetPath = resolve(args[i + 1]);
  else evidence = resolve(args[i + 1]);
}
const root = resolve("examples/react-vite");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Unsupported fixture entry: ${path}`);
  }
  return result;
}
async function hashes(paths, base) {
  return Promise.all(
    paths.map(async (path) => ({
      path: relative(base, path).split(sep).join("/"),
      sha256: sha256(await readFile(path)),
    })),
  );
}
async function sourceProvenance() {
  return hashes(
    [
      join(root, "index.html"),
      join(root, "package.json"),
      join(root, "vite.config.ts"),
      ...(await files(join(root, "src"))),
    ],
    root,
  );
}
function baselineServer(directory) {
  return createServer(async (req, res) => {
    try {
      const local =
        decodeURIComponent(
          new URL(req.url, "http://localhost").pathname.slice(1),
        ) || "index.html";
      const path = resolve(directory, local);
      if (!path.startsWith(directory + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.setHeader(
        "content-type",
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
        }[extname(path)] ?? "application/octet-stream",
      );
      res.setHeader("cache-control", "no-store");
      res.end(await readFile(path));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
}
const tmp = await mkdtemp(join(tmpdir(), "webguard-browser-benchmark-"));
const servers = [],
  origins = {};
let browser;
const report = {
  measuredAt: new Date().toISOString(),
  status: "running",
  fixture: "react-vite",
  environment: {
    node: process.version,
    vite: viteVersion,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
  },
  buildSettings: { target: "es2022", minify: "oxc", sourcemap: false },
  protection: {
    preset: "strict",
    obfuscation: { seed: 42 },
    runtime: "automatic SDK; shortcut/context-menu opt-in",
    headers: "automatic generated HTTP CSP",
    configFile: false,
  },
  builds: {},
  samplesPerCase: 5,
  warmupsPerCase: 1,
  warmups: [],
  pairs: [],
  limitations: [
    "Local headless Chromium on this host, not physical devices or production network performance.",
    "One warmup per case; each measured navigation uses a fresh context, CDP cache disabled. Pair order alternates to expose order/host noise.",
    "Runtime samples are observational: no universal percentage/time gate or statistical significance claim. Scheduling, frames, GC and host contention introduce noise.",
    "CPU durations are CDP metric deltas in seconds at named checkpoints; heap is point-in-time used JS heap, not peak memory.",
    "Lazy completion uses in-page performance marks from the capture-phase click to observed DOM completion; Playwright wall latency includes automation and polling.",
    "Payload ceilings apply only to this maintained fixture; gzip level 9 and Brotli quality 11 are computed per emitted JS asset, then summed, not observed HTTP compression.",
  ],
};
try {
  const { webguardApp } = await import("../packages/vite-plugin/dist/index.js");
  report.source = await sourceProvenance();
  report.lockfileSha256 = sha256(await readFile("pnpm-lock.yaml"));
  report.toolArtifacts = await hashes(
    (
      await Promise.all(
        (await readdir("packages")).map(async (name) => {
          const directory = resolve("packages", name, "dist");
          try {
            return (await files(directory)).filter((path) =>
              path.endsWith(".js"),
            );
          } catch (error) {
            if (error.code === "ENOENT") return [];
            throw error;
          }
        }),
      )
    ).flat(),
    resolve("."),
  );
  for (const kind of ["baseline", "protected"]) {
    const directory = join(tmp, kind);
    const start = performance.now();
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins:
        kind === "protected"
          ? [
              webguardApp({
                preset: "strict",
                obfuscation: { seed: 42 },
                runtime: {
                  devtools: { blockShortcuts: true, blockContextMenu: true },
                },
              }),
            ]
          : [],
      build: { ...report.buildSettings, outDir: directory, emptyOutDir: true },
    });
    const buildWallMs = performance.now() - start;
    const assets = [];
    const javascriptBytes = { raw: 0, gzip: 0, brotli: 0 };
    for (const path of await files(directory)) {
      const bytes = await readFile(path);
      const asset = {
        path: relative(directory, path).split(sep).join("/"),
        sha256: sha256(bytes),
        bytes: bytes.length,
      };
      if (path.endsWith(".js")) {
        asset.javascriptBytes = javascriptSizes(bytes);
        for (const encoding of Object.keys(javascriptBytes))
          javascriptBytes[encoding] += asset.javascriptBytes[encoding];
      }
      assets.push(asset);
    }
    if (
      JSON.stringify(await sourceProvenance()) !== JSON.stringify(report.source)
    )
      throw new Error("Fixture source changed during benchmark builds");
    report.builds[kind] = { buildWallMs, assets, javascriptBytes };
    const server =
      kind === "protected"
        ? await createProtectedServer(directory)
        : baselineServer(directory);
    servers.push(server);
    await new Promise((done, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", done);
    });
    origins[kind] = `http://127.0.0.1:${server.address().port}`;
    if (kind === "protected")
      report.expectedHeaders = JSON.parse(
        await readFile(join(directory, "webguard-headers.json"), "utf8"),
      );
  }
  if (budgetPath) {
    const bytes = await readFile(budgetPath);
    report.budget = {
      path: budgetPath,
      sha256: sha256(bytes),
      ...checkBudget(JSON.parse(bytes), report.builds),
    };
  } else
    report.budget = {
      passed: null,
      reason: "No --budget supplied; payload measurements only",
    };
  browser = await chromium.launch();
  report.browser = await browser.version();
  async function sample(kind) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      const metrics = async () =>
        Object.fromEntries(
          (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
            m.name,
            m.value,
          ]),
        );
      const before = await metrics();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        document.addEventListener(
          "click",
          (event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.closest("button")?.textContent === "Load module"
            )
              performance.mark("benchmark-lazy-start");
          },
          true,
        );
        const observer = new window.MutationObserver(() => {
          if (
            performance.getEntriesByName("benchmark-lazy-start").length &&
            document.querySelector('[role="status"]')?.textContent ===
              "Lazy module loaded: 42"
          ) {
            performance.mark("benchmark-lazy-end");
            observer.disconnect();
          }
        });
        observer.observe(document, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      });
      const response = await page.goto(origins[kind], { waitUntil: "load" });
      const atLoad = await metrics();
      const navigation = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0];
        return {
          domContentLoadedMs: n.domContentLoadedEventEnd,
          loadMs: n.loadEventEnd,
          responseEndMs: n.responseEnd,
        };
      });
      await page
        .getByRole("button", { name: "Count: 0", exact: true })
        .waitFor();
      const startup = await page.getByTestId("guard-startup").innerText();
      if (startup.includes("Automatic SDK ready") !== (kind === "protected"))
        throw new Error(`Unexpected SDK startup for ${kind}: ${startup}`);
      const headers = await response.allHeaders();
      if (kind === "protected") {
        const expected = Object.entries(report.expectedHeaders).find(
          ([name]) => name.toLowerCase() === "content-security-policy",
        )?.[1];
        if (!expected || headers["content-security-policy"] !== expected)
          throw new Error("Served CSP differs from generated policy");
      } else if (headers["content-security-policy"])
        throw new Error("Baseline unexpectedly has CSP");
      await page.getByRole("button", { name: "Count: 0", exact: true }).click();
      await page
        .getByRole("button", { name: "Count: 1", exact: true })
        .waitFor();
      const beforeLazy = await metrics();
      const wallStart = performance.now();
      await page
        .getByRole("button", { name: "Load module", exact: true })
        .click();
      await page.getByText("Lazy module loaded: 42", { exact: true }).waitFor();
      const lazyPlaywrightWallMs = performance.now() - wallStart;
      const afterLazy = await metrics();
      const runtime = await page.evaluate(() => ({
        lazyInPageMs:
          performance.getEntriesByName("benchmark-lazy-end")[0].startTime -
          performance.getEntriesByName("benchmark-lazy-start")[0].startTime,
        resourceTransferBytes: performance
          .getEntriesByType("resource")
          .reduce((sum, r) => sum + r.transferSize, 0),
      }));
      if (errors.length) throw new Error(errors.join("; "));
      return {
        kind,
        navigation,
        startup,
        cspHeader: headers["content-security-policy"] ?? null,
        ...runtime,
        lazyPlaywrightWallMs,
        cpuSeconds: {
          navigationThroughLoad: cpuDelta(before, atLoad),
          lazyInteraction: cpuDelta(beforeLazy, afterLazy),
          navigationThroughLazy: cpuDelta(before, afterLazy),
        },
        jsHeapUsedBytes: {
          load: atLoad.JSHeapUsedSize,
          lazy: afterLazy.JSHeapUsedSize,
        },
      };
    } finally {
      await context.close();
    }
  }
  for (const kind of ["baseline", "protected"])
    report.warmups.push(await sample(kind));
  for (let i = 0; i < 5; i++) {
    const order =
      i % 2 === 0 ? ["baseline", "protected"] : ["protected", "baseline"];
    const pair = { pair: i + 1, order, samples: [] };
    report.pairs.push(pair);
    for (const kind of order) pair.samples.push(await sample(kind));
  }
  report.summary = Object.fromEntries(
    ["baseline", "protected"].map((kind) => {
      const samples = report.pairs
        .flatMap((pair) => pair.samples)
        .filter((entry) => entry.kind === kind);
      return [
        kind,
        {
          sampleCount: samples.length,
          loadMs: summarizeValues(
            samples.map((entry) => entry.navigation?.loadMs),
          ),
          navigationCpuTaskSeconds: summarizeValues(
            samples.map(
              (entry) => entry.cpuSeconds?.navigationThroughLoad?.TaskDuration,
            ),
          ),
          lazyInPageMs: summarizeValues(
            samples.map((entry) => entry.lazyInPageMs),
          ),
          lazyCpuTaskSeconds: summarizeValues(
            samples.map(
              (entry) => entry.cpuSeconds?.lazyInteraction?.TaskDuration,
            ),
          ),
          jsHeapUsedBytes: {
            load: summarizeValues(
              samples.map((entry) => entry.jsHeapUsedBytes?.load),
            ),
            lazy: summarizeValues(
              samples.map((entry) => entry.jsHeapUsedBytes?.lazy),
            ),
          },
        },
      ];
    }),
  );
  if (report.budget.passed === false)
    throw new Error("Fixture JavaScript payload budget exceeded");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled([
    ...(browser ? [browser.close()] : []),
    ...servers.map(
      (server) =>
        new Promise((done, reject) => {
          if (!server.listening) {
            done();
            return;
          }
          server.close((error) => (error ? reject(error) : done()));
          server.closeAllConnections();
        }),
    ),
  ]);
  const removal = await Promise.allSettled([
    rm(tmp, { recursive: true, force: true }),
  ]);
  const failures = [...cleanup, ...removal]
    .filter((result) => result.status === "rejected")
    .map((result) => String(result.reason));
  report.cleanup = {
    temporaryDirectoryRemoved: removal[0].status === "fulfilled",
    errors: failures,
  };
  if (failures.length) {
    report.status = "failed";
    process.exitCode = 1;
  }
  await mkdir(dirname(evidence), { recursive: true });
  await writeFile(evidence, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: report.status,
        evidence,
        builds: report.builds,
        budget: report.budget,
        failure: report.failure,
      },
      null,
      2,
    ),
  );
}
