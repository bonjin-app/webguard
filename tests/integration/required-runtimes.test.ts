import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);

it("fails native SSR acceptance when required PHP is unavailable instead of passing with skips", async () => {
  const directory = await mkdtemp(join(tmpdir(), "webguard-required-runtime-"));
  const evidence = join(directory, "receipt.json");
  try {
    const execution = await run(
      process.execPath,
      [
        "scripts/verify-ssr-templates.mjs",
        "--require-native-runtimes",
        "--evidence",
        evidence,
      ],
      {
        env: {
          ...process.env,
          WEBGUARD_PYTHON: "python3",
          WEBGUARD_PHP: join(directory, "unavailable-php"),
          WEBGUARD_PHP_WASM_MODULES: "",
        },
        timeout: 25000,
        maxBuffer: 1024 * 1024,
      },
    ).then(
      () => ({ failed: false }),
      () => ({ failed: true }),
    );
    expect(execution.failed).toBe(true);
    const receipt = JSON.parse(await readFile(evidence, "utf8"));
    expect(receipt).toMatchObject({
      status: "failed",
      requiredNativeRuntimes: [
        { name: "Python WSGI", available: true },
        { name: "PHP", available: false },
      ],
      http: [],
      browsers: [],
    });
    expect(receipt.error).toMatch(/required native runtime.*PHP/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
