import {
  readFile,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("makes generic build and classic browser APIs available without a required Vite peer", async () => {
  const metadata = JSON.parse(
    await readFile("packages/npm/package.json", "utf8"),
  );
  expect(metadata.exports["./build"]).toEqual({
    types: "./dist/build.d.ts",
    import: "./dist/build.js",
  });
  expect(metadata.exports["./browser.global.js"]).toBe(
    "./dist/browser.global.js",
  );
  expect(metadata.bin.webguard).toBe("./dist/cli.js");
  expect(metadata.peerDependenciesMeta.vite.optional).toBe(true);
});

it("rejects unknown, ignored, conflicting and malformed generic CLI options before work", async () => {
  const { parseCliArguments } = await import("../../packages/npm/src/cli.js");
  for (const args of [
    [],
    ["wat"],
    ["protect"],
    ["scan", "dist", "--output", "other"],
    ["verify", "dist", "--preset", "strict"],
    ["headers", "dist"],
    ["protect-app", "dist", "--no-runtime", "--restrict-shortcuts"],
    ["protect-app", "dist", "--no-headers", "--trusted-types", "off"],
    ["protect", "dist", "--output", "--preset"],
    ["protect", "dist", "--output", "a", "--output", "b"],
    ["protect", "dist", "--preset", "invalid"],
    ["headers", "--trusted-types", "invalid"],
    ["scan", "dist", "extra"],
  ])
    expect(() => parseCliArguments(args), args.join(" ")).toThrow();
  expect(
    parseCliArguments([
      "protect-app",
      "dist",
      "--restrict-shortcuts",
      "--public-base",
      "/app/",
    ]),
  ).toMatchObject({
    command: "protect-app",
    directory: "dist",
    values: { "restrict-shortcuts": true, "public-base": "/app/" },
  });
  expect(parseCliArguments(["protect-app", "--help"]).command).toBe("help");
});

it("prints help, version and strict headers without filesystem side effects", async () => {
  const { runCli } = await import("../../packages/npm/src/cli.js");
  const output: string[] = [],
    errors: string[] = [];
  const io = {
    log: (value: string) => output.push(value),
    error: (value: string) => errors.push(value),
  };
  expect(await runCli(["--help"], io)).toBe(0);
  expect(output.pop()).toContain("protect-app");
  expect(await runCli(["--version"], io)).toBe(0);
  const metadata = JSON.parse(
    await readFile("packages/npm/package.json", "utf8"),
  );
  expect(output.pop()).toBe(metadata.version);
  expect(await runCli(["headers", "--trusted-types", "report-only"], io)).toBe(
    0,
  );
  expect(
    JSON.parse(output.pop()!)["Content-Security-Policy-Report-Only"],
  ).toContain("require-trusted-types-for");
  expect(await runCli(["scan", "dist", "--output", "ignored"], io)).toBe(1);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("not supported by scan");
});

it("runs generic asset protection, scan, report and tamper verification without Vite", async () => {
  const { runCli } = await import("../../packages/npm/src/cli.js");
  const root = await mkdtemp(join(tmpdir(), "webguard-generic-cli-"));
  const input = join(root, "input"),
    output = join(root, "protected");
  const messages: string[] = [],
    errors: string[] = [];
  const io = {
    log: (value: string) => messages.push(value),
    error: (value: string) => errors.push(value),
  };
  try {
    await mkdir(input);
    await writeFile(
      join(input, "index.html"),
      '<!doctype html><script src="/app.js"></script>',
    );
    await writeFile(
      join(input, "app.js"),
      'globalThis.result = "generic consumer";',
    );
    expect(
      await runCli(
        ["protect", input, "--output", output, "--preset", "standard"],
        io,
      ),
    ).toBe(0);
    expect(errors).toEqual([]);
    expect(
      JSON.parse(messages.pop()!).files.some(
        (file: { transformed: boolean }) => file.transformed,
      ),
    ).toBe(true);
    expect(await readFile(join(input, "app.js"), "utf8")).toBe(
      'globalThis.result = "generic consumer";',
    );
    expect(await runCli(["scan", output], io)).toBe(0);
    expect(Array.isArray(JSON.parse(messages.pop()!))).toBe(true);
    expect(await runCli(["report", output], io)).toBe(0);
    expect(JSON.parse(messages.pop()!).preset).toBe("standard");
    expect(await runCli(["verify", output], io)).toBe(0);
    expect(JSON.parse(messages.pop()!).valid).toBe(true);
    await writeFile(join(output, "app.js"), "globalThis.result = 'tampered';");
    expect(await runCli(["verify", output], io)).toBe(1);
    expect(JSON.parse(messages.pop()!).valid).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("executes the actual npm-style CLI symlink rather than silently skipping its entrypoint", async () => {
  await mkdir(".npm-release", { recursive: true });
  const root = await mkdtemp(resolve(".npm-release/generic-cli-bin-"));
  try {
    await symlink(
      resolve("packages/npm/node_modules"),
      join(root, "node_modules"),
      "dir",
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
    const bin = join(root, "webguard");
    await symlink(target, bin);
    const result = await promisify(execFile)(
      process.execPath,
      [bin, "--help"],
      { timeout: 10000 },
    );
    expect(result.stdout).toContain("Usage: webguard");
    expect(result.stdout).toContain("protect-app");
    expect(result.stderr).toBe("");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
