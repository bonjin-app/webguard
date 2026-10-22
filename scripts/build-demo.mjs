import {
  cp,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateDistribution } from "./distribution.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, ".demo-dist");
const minimalHeaders = {
  "Content-Security-Policy":
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};

/** Build into a sibling staging directory; publish only after every app succeeds. */
export async function buildDemo() {
  const stage = await mkdtemp(join(root, ".demo-stage-"));
  const backup = join(root, `.demo-backup-${randomUUID()}`);
  try {
    const requireVite = createRequire(
      new URL("../apps/docs/package.json", import.meta.url),
    );
    const { build } = await import(
      pathToFileURL(requireVite.resolve("vite")).href
    );
    for (const [source, target, base] of [
      ["apps/playground", "playground", "/"],
      ["apps/docs", "docs", "/docs/"],
      ["examples/react-vite", "react", "/examples/react/"],
      ["examples/vanilla-js", "vanilla-js", "/examples/vanilla-js/"],
      ["examples/vanilla-ts", "vanilla-ts", "/examples/vanilla-ts/"],
    ]) {
      await build({
        root: join(root, source),
        base,
        build: { outDir: join(stage, target), emptyOutDir: true },
      });
    }
    await validateDistribution(join(root, "distributions"));
    await cp(join(root, "distributions"), join(stage, "distribution"), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    await validateDistribution(join(stage, "distribution"));
    // Reports describe the published demo, not the temporary staging paths.
    for (const name of [
      "playground",
      "docs",
      "react",
      "vanilla-js",
      "vanilla-ts",
    ]) {
      const path = join(stage, name, "webguard-report.json");
      const report = JSON.parse(await readFile(path, "utf8"));
      report.output = join(output, name);
      await writeFile(path, JSON.stringify(report, null, 2) + "\n");
    }
    for (const name of ["playground", "docs"])
      await writeFile(
        join(stage, name, "webguard-headers.json"),
        JSON.stringify(minimalHeaders, null, 2) + "\n",
      );
    for (const name of [
      "playground",
      "docs",
      "react",
      "vanilla-js",
      "vanilla-ts",
    ]) {
      if (!(await stat(join(stage, name, "index.html"))).isFile())
        throw new Error(`Missing demo entry: ${name}`);
      const headers = JSON.parse(
        await readFile(join(stage, name, "webguard-headers.json"), "utf8"),
      );
      if (
        typeof headers["Content-Security-Policy"] !== "string" ||
        !headers["Content-Security-Policy"]
      )
        throw new Error(`Missing demo header policy: ${name}`);
    }
    let previous = false;
    try {
      await rename(output, backup);
      previous = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(stage, output);
    } catch (error) {
      if (previous) await rename(backup, output);
      throw error;
    }
    if (previous) await rm(backup, { recursive: true, force: true });
    console.log(`Demo assembled at ${output}`);
    return output;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await buildDemo();
  } catch (error) {
    console.error(`Demo build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
