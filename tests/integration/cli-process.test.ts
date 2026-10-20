import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const bin = resolve("packages/cli/dist/bin.js");
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-cli-process-"));
  dirs.push(root);
  return root;
}
function run(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
}
it("generated init config works from an application outside the toolkit checkout", async () => {
  const root = await fixture();
  expect(run(root, "init").status).toBe(0);
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist", "app.js"), "globalThis.answer=42;");
  const protection = run(root, "protect", "dist");
  expect(protection.stderr).toBe("");
  expect(protection.status).toBe(0);
  expect(run(root, "verify", "dist-protected").status).toBe(0);
  expect(run(root, "scan", "dist-protected").status).toBe(0);
  expect(JSON.parse(run(root, "report", "dist-protected").stdout).preset).toBe(
    "standard",
  );
  const original = await readFile(join(root, "webguard.config.ts"), "utf8");
  expect(run(root, "init").status).toBe(1);
  expect(await readFile(join(root, "webguard.config.ts"), "utf8")).toBe(
    original,
  );
  await writeFile(join(root, "dist-protected", "app.js"), "tampered");
  expect(run(root, "verify", "dist-protected").status).toBe(1);
});
it("build executes an explicit local command and respects its failure exit code", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "build.cjs"),
    "const fs=require('node:fs');fs.mkdirSync('dist');fs.writeFileSync('dist/app.js','globalThis.answer=42;');",
  );
  const result = run(
    root,
    "build",
    "--command",
    "node build.cjs",
    "--input",
    "dist",
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(run(root, "verify", "dist-protected").status).toBe(0);
  const failed = run(
    root,
    "build",
    "--command",
    'node -e "process.exit(7)"',
    "--output",
    "never-created",
  );
  expect(failed.status).toBe(1);
  expect(failed.stderr).toContain("7");
});
it("rejects malformed default configuration instead of silently applying defaults", async () => {
  const root = await fixture();
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/app.js"), "globalThis.answer=42;");
  await writeFile(join(root, "webguard.config.ts"), "export default 5;");
  const result = run(root, "protect", "dist");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("must be an object");
});
