import { build } from "vite";
import { chromium } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
const tmp = await mkdtemp(join(tmpdir(), "webguard-browser-benchmark-"));
let browser, server;
try {
  const baseline = join(tmp, "baseline");
  await build({
    root: resolve("examples/react-vite"),
    configFile: false,
    logLevel: "silent",
    build: { outDir: baseline, emptyOutDir: true },
  });
  let servedRoot = baseline;
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const root = servedRoot;
      const local = decodeURIComponent(url.pathname.slice(1)) || "index.html";
      const path = resolve(root, local);
      if (!path.startsWith(root + "/")) {
        res.statusCode = 403;
        res.end();
        return;
      }
      const bytes = await readFile(path);
      res.setHeader(
        "content-type",
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
        }[extname(path)] ?? "application/octet-stream",
      );
      res.setHeader("cache-control", "no-store");
      res.end(bytes);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  browser = await chromium.launch();
  const cases = [];
  for (const kind of ["baseline", "protected"]) {
    servedRoot =
      kind === "baseline" ? baseline : resolve("examples/react-vite/dist");
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/`, {
        waitUntil: "networkidle",
      });
      await page.getByRole("button", { name: "Count: 0" }).click();
      await page.getByRole("button", { name: "Count: 1" }).waitFor();
      const lazyStart = performance.now();
      await page.getByRole("button", { name: "Load module" }).click();
      await page.getByText("Lazy module loaded: 42", { exact: true }).waitFor();
      const lazyRoundtripMs = performance.now() - lazyStart;
      if (errors.length) throw Error(errors.join("; "));
      const navigation = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0];
        return {
          domContentLoadedMs: n.domContentLoadedEventEnd,
          loadMs: n.loadEventEnd,
          resourceTransferBytes: performance
            .getEntriesByType("resource")
            .reduce((sum, r) => sum + r.transferSize, 0),
        };
      });
      const metrics = Object.fromEntries(
        (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
          m.name,
          m.value,
        ]),
      );
      samples.push({
        ...navigation,
        lazyRoundtripMs,
        taskDurationSeconds: metrics.TaskDuration,
        jsHeapUsedBytes: metrics.JSHeapUsedSize,
      });
      await context.close();
    }
    cases.push({ kind, samples });
  }
  const report = {
    measuredAt: new Date().toISOString(),
    browser: await browser.version(),
    samplesPerCase: 3,
    cases,
    limitations: [
      "Headless Chromium on this host, not physical devices.",
      "Local HTTP, fresh contexts, cache disabled by server. No universal threshold or statistical significance claimed.",
      "CDP TaskDuration is browser task CPU time; JSHeapUsedSize is a point-in-time heap sample, not peak total memory.",
      "Baseline and protected builds share the same React source.",
    ],
  };
  await writeFile(
    "docs/evidence/benchmark-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
  await rm(tmp, { recursive: true, force: true });
}
