import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { createManifest } from "../../packages/integrity/src/index.js";
import { createSecurityHeaders } from "../../packages/core/src/index.js";
import { parseCliArguments, runCli } from "../../packages/npm/src/cli.js";

it("accepts doctor with default dist, strict JSON flag and command help", () => {
  expect(parseCliArguments(["doctor"]).command).toBe("doctor");
  expect(parseCliArguments(["doctor", "out", "--json"]).values).toMatchObject({
    json: true,
  });
  expect(parseCliArguments(["doctor", "--help"]).command).toBe("help");
  for (const args of [
    ["doctor", "--output", "x"],
    ["scan", "x", "--json"],
    ["doctor", "--json", "--json"],
    ["doctor", "x", "y"],
  ])
    expect(() => parseCliArguments(args)).toThrow();
});

it("diagnoses protected static builds without leaking content or modifying files", async () => {
  const root = await mkdtemp(join(tmpdir(), "webguard-doctor-"));
  const messages: string[] = [],
    errors: string[] = [];
  const io = {
    log: (s: string) => messages.push(s),
    error: (s: string) => errors.push(s),
  };
  const check = async (directory = root) => {
    const code = await runCli(["doctor", directory, "--json"], io);
    expect(errors).toEqual([]);
    return { code, result: JSON.parse(messages.pop()!) };
  };
  try {
    expect(await check(join(root, "missing"))).toMatchObject({
      code: 1,
      result: {
        status: "failed",
        checks: [{ id: "directory", status: "failed" }],
      },
    });
    expect(await check()).toMatchObject({
      code: 1,
      result: { status: "failed" },
    });
    await writeFile(
      join(root, "index.html"),
      "<!doctype html><p>SECRET_SOURCE</p>",
    );
    await writeFile(join(root, "app.js"), 'globalThis.value="SECRET_SOURCE"');
    await writeFile(
      join(root, "webguard-manifest.json"),
      JSON.stringify(await createManifest(root)),
    );
    expect(await check()).toMatchObject({
      code: 1,
      result: { status: "failed" },
    });
    await writeFile(
      join(root, "webguard-headers.json"),
      JSON.stringify(createSecurityHeaders()),
    );
    const before = await readFile(join(root, "webguard-manifest.json"), "utf8");
    expect(await check()).toMatchObject({
      code: 0,
      result: { status: "passed", scope: "local-static-build" },
    });
    expect(await readFile(join(root, "webguard-manifest.json"), "utf8")).toBe(
      before,
    );
    expect(await runCli(["doctor", root], io)).toBe(0);
    expect(messages.pop()).toContain("Local check passed");
    await writeFile(join(root, "app.js"), "SECRET_TAMPER");
    const tampered = await check();
    expect(tampered.code).toBe(1);
    expect(JSON.stringify(tampered.result)).not.toMatch(
      /SECRET|sha384-|script-src/,
    );
    await writeFile(
      join(root, "webguard-headers.json"),
      JSON.stringify({
        "Content-Security-Policy": "SECRET_HEADER",
        "X-Content-Type-Options": "wrong",
      }),
    );
    expect((await check()).code).toBe(1);
    const next = join(root, ".next");
    await mkdir(next);
    expect(await check(next)).toMatchObject({
      code: 1,
      result: {
        status: "failed",
        checks: [{ id: "directory", status: "failed" }],
      },
    });
    await rm(join(root, "webguard-manifest.json"));
    await symlink(join(root, "app.js"), join(root, "webguard-manifest.json"));
    expect((await check()).code).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each([
  ["malformed manifest", "manifest"],
  ["unsafe manifest", "assets"],
  ["empty manifest", "assets"],
  ["missing asset", "assets"],
  ["extra asset", "assets"],
  ["symlink asset", "assets"],
  ["duplicate header", "headers"],
  ["control header", "headers"],
  ["symlink header", "headers"],
])("fails closed for %s with redacted guidance", async (scenario, checkId) => {
  const root = await mkdtemp(join(tmpdir(), "webguard-doctor-invalid-"));
  try {
    await writeFile(
      join(root, "index.html"),
      "<!doctype html><script src='/app.js'></script>",
    );
    await writeFile(join(root, "app.js"), 'globalThis.value="PRIVATE_PAYLOAD"');
    const manifest = await createManifest(root);
    await writeFile(
      join(root, "webguard-manifest.json"),
      JSON.stringify(manifest),
    );
    await writeFile(
      join(root, "webguard-headers.json"),
      JSON.stringify(createSecurityHeaders()),
    );
    if (scenario === "malformed manifest")
      await writeFile(
        join(root, "webguard-manifest.json"),
        "PRIVATE_MALFORMED",
      );
    if (scenario === "unsafe manifest")
      await writeFile(
        join(root, "webguard-manifest.json"),
        JSON.stringify({
          ...manifest,
          files: { "../PRIVATE_PATH": { size: 0, integrity: "PRIVATE_HASH" } },
        }),
      );
    if (scenario === "empty manifest") {
      await rm(join(root, "app.js"));
      await rm(join(root, "index.html"));
      await writeFile(
        join(root, "webguard-manifest.json"),
        JSON.stringify({ ...manifest, files: {} }),
      );
    }
    if (scenario === "missing asset") await rm(join(root, "app.js"));
    if (scenario === "extra asset")
      await writeFile(join(root, "PRIVATE_EXTRA.js"), "PRIVATE_PAYLOAD");
    if (scenario === "symlink asset") {
      await rm(join(root, "app.js"));
      await symlink(join(root, "index.html"), join(root, "app.js"));
    }
    if (scenario === "duplicate header")
      await writeFile(
        join(root, "webguard-headers.json"),
        JSON.stringify({
          ...createSecurityHeaders(),
          "content-security-policy": "PRIVATE_POLICY",
        }),
      );
    if (scenario === "control header")
      await writeFile(
        join(root, "webguard-headers.json"),
        JSON.stringify({
          ...createSecurityHeaders(),
          "X-Private": "PRIVATE\r\nHEADER",
        }),
      );
    if (scenario === "symlink header") {
      await rm(join(root, "webguard-headers.json"));
      await symlink(join(root, "app.js"), join(root, "webguard-headers.json"));
    }
    let output = "";
    expect(
      await runCli(["doctor", root, "--json"], {
        log: (s) => {
          output = s;
        },
        error: (s) => {
          throw new Error(s);
        },
      }),
    ).toBe(1);
    const result = JSON.parse(output);
    expect(result.status).toBe("failed");
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: checkId,
        status: "failed",
        nextAction: expect.any(String),
      }),
    );
    expect(output).not.toMatch(/PRIVATE|sha384-|script-src/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("executes the bundled npm CLI with default dist from the consumer working directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "webguard-doctor-bin-"));
  try {
    const dist = join(root, "dist");
    await mkdir(dist);
    await symlink(
      resolve("packages/npm/node_modules"),
      join(root, "node_modules"),
      "dir",
    );
    await writeFile(
      join(dist, "index.html"),
      "<!doctype html><script src='/app.js'></script>",
    );
    await writeFile(join(dist, "app.js"), 'globalThis.value="consumer"');
    await writeFile(
      join(dist, "webguard-manifest.json"),
      JSON.stringify(await createManifest(dist)),
    );
    await writeFile(
      join(dist, "webguard-headers.json"),
      JSON.stringify(createSecurityHeaders()),
    );
    const target = join(root, "cli.js");
    await build({
      entryPoints: ["packages/npm/src/cli.ts"],
      outfile: target,
      platform: "node",
      format: "esm",
      bundle: true,
      packages: "external",
      tsconfig: "tsconfig.json",
      logLevel: "silent",
    });
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [target, "doctor", "--json"],
      { cwd: root, timeout: 10000 },
    );
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      status: "passed",
      scope: "local-static-build",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each([
  ["index.htm", "app.js"],
  ["INDEX.HTML", "APP.JS"],
])(
  "accepts supported static filename extensions %s and %s",
  async (html, javascript) => {
    const root = await mkdtemp(join(tmpdir(), "webguard-doctor-extension-"));
    try {
      await writeFile(
        join(root, html),
        `<!doctype html><script src='./${javascript}'></script>`,
      );
      await writeFile(join(root, javascript), "globalThis.legacyApp = true;");
      await writeFile(
        join(root, "webguard-manifest.json"),
        JSON.stringify(await createManifest(root)),
      );
      await writeFile(
        join(root, "webguard-headers.json"),
        JSON.stringify(createSecurityHeaders()),
      );
      let output = "";
      expect(
        await runCli(["doctor", root, "--json"], {
          log: (value) => {
            output = value;
          },
          error: (value) => {
            throw new Error(value);
          },
        }),
      ).toBe(0);
      expect(JSON.parse(output)).toMatchObject({
        status: "passed",
        scope: "local-static-build",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
