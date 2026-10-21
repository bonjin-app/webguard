import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";
import { build } from "esbuild";

const exec = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const tarball = resolve(
  process.argv[2] ?? join(root, ".npm-release/uulab-webguard-0.3.0.tgz"),
);
const check = (value, message) => {
  if (!value) throw new Error(message);
};
async function command(file, args, cwd) {
  try {
    return await exec(file, args, {
      cwd,
      timeout: 180000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `${file} ${args.join(" ")}\n${error.stdout ?? ""}\n${error.stderr ?? error.message}`,
      { cause: error },
    );
  }
}
async function files(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    result.push(...(item.isDirectory() ? await files(path) : [path]));
  }
  return result;
}
const directory = await mkdtemp(
  join(tmpdir(), "webguard-official-vite-starters-"),
);
const generatorFile = join(directory, "setup-generator.mjs");
await build({
  entryPoints: [join(root, "apps/playground/src/setup.ts")],
  outfile: generatorFile,
  format: "esm",
  platform: "node",
  bundle: true,
});
const { createViteSetup } = await import(pathToFileURL(generatorFile).href);
const evidence = {
  checkedAt: new Date().toISOString(),
  sourceCommit: (
    await command("git", ["rev-parse", "HEAD"], root)
  ).stdout.trim(),
  method:
    "Official create-vite starters outside repository; local tarball installed with npm; exact configurations from the demo generator; no application source edits or manual SDK initialization",
  tarball,
  tarballIntegrity: `sha512-${createHash("sha512")
    .update(await readFile(tarball))
    .digest("base64")}`,
  createVite: "9.3.1",
  vite: "8.3.4",
  directory,
  npmPublished: false,
  cases: [],
  limitations: [
    "Browsers enforcing Trusted Types reject stock vanilla Vite innerHTML. Strict-default failures are recorded explicitly; report-only is a compatibility choice, not equivalent sink enforcement.",
    "Trusted Types support is measured from each installed browser rather than inferred from its engine name.",
    "Shortcut controls are advisory; a browser owner can open DevTools. Server authorization and demo business-validation scenarios are separate application code.",
  ],
};
let failure;
try {
  for (const template of ["vanilla", "react"]) {
    const name = `official-${template}`;
    console.log(`Creating ${template} in ${join(directory, name)}`);
    await command(
      "npm",
      [
        "exec",
        "--yes",
        "--registry=https://registry.npmjs.org",
        "--package=create-vite@9.3.1",
        "--",
        "create-vite",
        name,
        "--template",
        template,
        "--no-interactive",
      ],
      directory,
    );
    const project = join(directory, name);
    await command(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--save-dev",
        "--save-exact",
        "--registry=https://registry.npmjs.org",
        tarball,
        "vite@8.3.4",
      ],
      project,
    );
    const installed = JSON.parse(
      await readFile(
        join(project, "node_modules/uulab-webguard/package.json"),
        "utf8",
      ),
    );
    check(
      installed.name === "uulab-webguard" && installed.version === "0.3.0",
      "Incorrect installed package",
    );
    const variants =
      template === "vanilla" ? ["strict", "report-only"] : ["strict"];
    for (const variant of variants) {
      const { code: config } = createViteSetup({
        project:
          variant === "report-only"
            ? "vanilla-string"
            : template === "react"
              ? "react"
              : "dom",
        blockShortcuts: true,
        blockContextMenu: true,
      });
      const configFile =
        template === "react" ? "vite.config.js" : "vite.config.mjs";
      await writeFile(join(project, configFile), config);
      const dist = join(project, `dist-${variant}`);
      const built = await command(
        process.execPath,
        [
          join(project, "node_modules/vite/bin/vite.js"),
          "build",
          "--config",
          configFile,
          "--outDir",
          dist,
        ],
        project,
      );
      const report = JSON.parse(
        await readFile(join(dist, "webguard-report.json"), "utf8"),
      );
      check(
        report.preset === "strict" &&
          Object.keys(report.chunkTransforms ?? {}).length > 0,
        "Missing strict obfuscation transforms",
      );
      const compatibilityWarning = (built.stdout + built.stderr).includes(
        "WG_TRUSTED_TYPES_SINK",
      );
      check(
        compatibilityWarning ===
          (template === "vanilla" && variant === "strict"),
        "Installed build compatibility warning differs from selected template/policy",
      );
      check(
        (await files(dist)).every((path) => !path.endsWith(".map")),
        "Public sourcemap emitted",
      );
      const html = await readFile(join(dist, "index.html"), "utf8");
      const entries = [...html.matchAll(/<(?:script|link)\b[^>]*>/g)].filter(
        (match) => /(?:src|href)="[^"]+\.(?:js|css)"/.test(match[0]),
      );
      check(entries.length > 0, "Missing entry assets");
      for (const [tag] of entries) {
        const target = /(?:src|href)="([^"]+)"/.exec(tag)[1];
        const integrity = /integrity="([^"]+)"/.exec(tag)?.[1];
        const hash = createHash("sha384")
          .update(await readFile(join(dist, target.replace(/^\//, ""))))
          .digest("base64");
        check(integrity === `sha384-${hash}`, `SRI mismatch for ${target}`);
      }
      const result = {
        template,
        variant,
        project,
        dist,
        config,
        installedVersion: installed.version,
        obfuscationPreset: report.preset,
        compatibilityWarning,
        chunkTransforms: report.chunkTransforms,
        publicSourceMaps: false,
        sriAssetsVerified: entries.length,
        browsers: [],
      };
      evidence.cases.push(result);
      const serverModule = await import(
        pathToFileURL(
          join(project, "node_modules/uulab-webguard/dist/server.js"),
        ).href
      );
      const server = await serverModule.createProtectedServer(dist);
      try {
        await new Promise((resolveListening, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", resolveListening);
        });
        const url = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(url);
        const headers = JSON.parse(
          await readFile(join(dist, "webguard-headers.json"), "utf8"),
        );
        check(
          response.headers.get("content-security-policy") ===
            headers["Content-Security-Policy"],
          "Protected server omitted generated CSP",
        );
        check(
          response.headers.get("x-content-type-options") === "nosniff",
          "Missing nosniff",
        );
        result.httpHeadersVerified = true;
        for (const path of [
          "webguard-report.json",
          "webguard-headers.json",
          "_headers",
          "package.json",
          "src/main.jsx",
          ".env",
        ])
          check(
            (await fetch(`${url}/${path}`)).status === 404,
            `Private resource exposed: ${path}`,
          );
        result.privatePaths404 = true;
        for (const [name, engine] of Object.entries({
          chromium,
          firefox,
          webkit,
        })) {
          const browser = await engine.launch({ headless: true });
          try {
            const page = await browser.newPage();
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.goto(url, { waitUntil: "networkidle" });
            await page.waitForFunction(() =>
              Boolean(
                window[Symbol.for("webguard.browser.auto.v1")]?.isActive(),
              ),
            );
            const automaticSdk = await page.evaluate(() =>
              window[
                Symbol.for("webguard.browser.auto.v1")
              ].instance.getOptions(),
            );
            check(
              automaticSdk.preset === "strict" &&
                automaticSdk.devtools?.blockShortcuts === true &&
                automaticSdk.devtools?.blockContextMenu === true,
              "Automatic SDK preset incorrect",
            );
            const trustedTypesSupported = await page.evaluate(
              () => typeof window.trustedTypes?.createPolicy === "function",
            );
            const expectedIncompatibility =
              template === "vanilla" &&
              variant === "strict" &&
              trustedTypesSupported;
            const browserResult = {
              name,
              version: browser.version(),
              automaticSdk,
              trustedTypesSupported,
              pageErrors: errors,
              expectedIncompatibility,
            };
            result.browsers.push(browserResult);
            if (expectedIncompatibility) {
              check(
                errors.some((error) =>
                  /TrustedHTML|Trusted Types|Sink type mismatch/.test(error),
                ),
                "Stock vanilla did not reproduce expected Trusted Types incompatibility",
              );
              check(
                (await page.locator("#counter").count()) === 0,
                "Expected stock vanilla failure did not occur",
              );
              browserResult.outcome =
                "expected-stock-innerHTML-incompatibility";
            } else {
              const counter =
                template === "react"
                  ? page.getByRole("button", { name: /^count is 0$/i })
                  : page.locator("#counter");
              await counter.click();
              await page
                .getByRole("button", {
                  name: /^count is 1$/i,
                  exact: true,
                })
                .waitFor();
              check(
                errors.length === 0,
                `${template}/${variant}/${name}: ${errors.join("; ")}`,
              );
              browserResult.outcome = "passed";
              browserResult.counterWorks = true;
            }
            const policy = await page.evaluate(async () => {
              let violations = 0;
              document.addEventListener(
                "securitypolicyviolation",
                () => violations++,
              );
              const script = document.createElement("script");
              let inlineBlockedByTrustedTypes = false;
              try {
                script.textContent = "window.__starterInjected = true";
                document.body.append(script);
              } catch {
                inlineBlockedByTrustedTypes = true;
              }
              await new Promise((resolveTimer) => setTimeout(resolveTimer, 80));
              return {
                inlineBlocked: !window.__starterInjected,
                inlineBlockedByTrustedTypes,
                violations,
              };
            });
            check(
              policy.inlineBlocked,
              "Inline injection unexpectedly executed",
            );
            browserResult.inlinePolicy = policy;
            await page.close();
            console.log(
              `${template}/${variant}/${name}: ${browserResult.outcome}`,
            );
          } finally {
            await browser.close();
          }
        }
      } finally {
        server.closeAllConnections();
        await new Promise((resolveClose, reject) =>
          server.close((error) => (error ? reject(error) : resolveClose())),
        );
      }
    }
  }
} catch (error) {
  failure = error;
  evidence.error = String(error.stack ?? error);
} finally {
  evidence.completedAt = new Date().toISOString();
  evidence.passed = !failure;
  await writeFile(
    join(root, "docs/evidence/vite-starters.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(`Retained official Vite projects: ${directory}`);
}
if (failure) throw failure;
