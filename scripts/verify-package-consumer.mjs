import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
let evidence = join(root, "docs/evidence/package-consumer.json");
let isolatedStore = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--isolated-store") isolatedStore = true;
  else if (
    args[index] === "--evidence" &&
    args[index + 1] &&
    !args[index + 1].startsWith("--")
  )
    evidence = resolve(args[++index]);
  else
    throw Error(
      "Usage: node scripts/verify-package-consumer.mjs [--isolated-store] [--evidence PATH]",
    );
}
const temporary = await mkdtemp(join(tmpdir(), "webguard-one-package-"));
function run(args, cwd = root) {
  const r = spawnSync("pnpm", args, { cwd, encoding: "utf8", timeout: 120000 });
  if (r.status !== 0)
    throw Error(`${args.join(" ")} failed: ${r.stderr}\n${r.stdout}`);
  return r.stdout;
}
try {
  const overrides = {};
  for (const name of [
    "shared",
    "core",
    "obfuscator",
    "integrity",
    "browser",
    "cli",
    "vite-plugin",
  ]) {
    run(
      ["pack", "--pack-destination", temporary],
      join(root, "packages", name),
    );
    const metadata = JSON.parse(
      await readFile(join(root, "packages", name, "package.json"), "utf8"),
    );
    overrides[`@webguard/${name}`] =
      `file:${join(temporary, `webguard-${name}-${metadata.version}.tgz`)}`;
  }
  const pkg = {
    private: true,
    type: "module",
    packageManager: "pnpm@11.10.0",
    dependencies: {
      "@webguard/vite-plugin": overrides["@webguard/vite-plugin"],
      vite: "8.3.4",
    },
  };
  await writeFile(join(temporary, "package.json"), JSON.stringify(pkg));
  await writeFile(
    join(temporary, "pnpm-workspace.yaml"),
    "packages: []\noverrides:\n" +
      Object.entries(overrides)
        .map(
          ([key, value]) =>
            "  " + JSON.stringify(key) + ": " + JSON.stringify(value),
        )
        .join("\n") +
      "\n",
  );
  run(
    [
      "install",
      "--prefer-offline",
      "--ignore-scripts",
      ...(isolatedStore ? ["--store-dir", join(temporary, "pnpm-store")] : []),
    ],
    temporary,
  );
  await writeFile(
    join(temporary, "index.html"),
    '<html><head></head><body><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(
    join(temporary, "main.js"),
    "import {getWebGuard} from '@webguard/vite-plugin/client'; globalThis.packagedGuardReady=Boolean(getWebGuard()); const e=new KeyboardEvent('keydown',{key:'F12',bubbles:true,cancelable:true}); document.dispatchEvent(e);globalThis.packagedShortcutBlocked=e.defaultPrevented;",
  );
  await writeFile(
    join(temporary, "vite.config.js"),
    "import {webguardApp} from '@webguard/vite-plugin'; export default {plugins:[webguardApp({runtime:{devtools:{blockShortcuts:true}}})]};",
  );
  run(["exec", "vite", "build"], temporary);
  const assets = await readdir(join(temporary, "dist", "assets"));
  const code = await readFile(
    join(
      temporary,
      "dist",
      "assets",
      assets.find((f) => f.endsWith(".js")),
    ),
    "utf8",
  );
  const { JSDOM } = await import(
    pathToFileURL(join(root, "node_modules/jsdom/lib/api.js")).href
  );
  const { runInContext } = await import("node:vm");
  const dom = new JSDOM("", {
    runScripts: "outside-only",
    url: "https://example.test",
  });
  try {
    runInContext(code, dom.getInternalVMContext(), { timeout: 5000 });
    if (!dom.window.packagedGuardReady || !dom.window.packagedShortcutBlocked)
      throw Error("Packaged auto/client startup failed");
  } finally {
    dom.window.close();
  }
  const headers = JSON.parse(
    await readFile(join(temporary, "dist", "webguard-headers.json"), "utf8"),
  );
  if (
    !headers["Content-Security-Policy"].includes(
      "require-trusted-types-for 'script'",
    )
  )
    throw Error("Missing packaged header artifact");
  const report = {
    checkedAt: new Date().toISOString(),
    method:
      "Prefer-offline install of packed tarballs in unrelated temporary application, with registry downloads for cache misses; no workspace links or aliases",
    packageStore: isolatedStore
      ? "fresh isolated store"
      : "configured pnpm store",
    directProtectionDependency: "@webguard/vite-plugin only",
    fixtureOverrides:
      "All internal temporary package names pinned to local tarballs because no packages are published",
    build: true,
    automaticSdkBeforeApp: true,
    clientSubpath: true,
    shortcutInterception: true,
    headerArtifacts: true,
    registryPublish: false,
  };
  await mkdir(dirname(evidence), { recursive: true });
  await writeFile(evidence, JSON.stringify(report, null, 2) + "\n");
  console.log(
    "Packaged consumer build, automatic SDK, client subpath and headers passed.",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
