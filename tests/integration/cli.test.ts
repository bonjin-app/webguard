import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protectDirectory, scanDirectory } from "../../packages/cli/src/index";
import { verifyManifest } from "@webguard/integrity";
const temps: string[] = [];
afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "webguard-"));
  temps.push(root);
  const input = join(root, "dist");
  await mkdir(input);
  return { root, input, output: join(root, "protected") };
}
describe("transactional protection", () => {
  it("preserves input, archives maps, removes source files and produces verifiable output", async () => {
    const { input, output } = await fixture();
    const source =
      "globalThis.answer = 40 + 2;\n//# sourceMappingURL=app.js.map";
    await writeFile(join(input, "app.js"), source);
    await writeFile(join(input, "app.js.map"), '{"version":3}');
    await writeFile(join(input, "app.ts"), "const secretSource: number = 42;");
    const report = await protectDirectory(input, {
      output,
      config: { sourceMaps: { privateArtifacts: true } },
    });
    expect(await readFile(join(input, "app.js"), "utf8")).toBe(source);
    expect(await readdir(output)).not.toContain("app.js.map");
    expect(await readdir(output)).not.toContain("app.ts");
    expect(await readFile(join(output, "app.js"), "utf8")).not.toContain(
      "sourceMappingURL",
    );
    expect(report.files[0]?.outputBytes).toBeGreaterThan(0);
    const manifest = JSON.parse(
      await readFile(join(output, "webguard-manifest.json"), "utf8"),
    );
    expect((await verifyManifest(output, manifest)).valid).toBe(true);
    expect(
      await readFile(
        join(`${output}.private-maps`, "generated-maps/app.js.map"),
        "utf8",
      ),
    ).toBeTruthy();
  });
  it("does not overwrite an existing destination", async () => {
    const { input, output } = await fixture();
    await mkdir(output);
    await writeFile(join(output, "keep"), "existing");
    await expect(protectDirectory(input, { output })).rejects.toThrow(/exist/i);
    expect(await readFile(join(output, "keep"), "utf8")).toBe("existing");
  });
  it("refuses nested and ancestor destinations before writing", async () => {
    const { input, root } = await fixture();
    await expect(
      protectDirectory(input, { output: join(input, "protected") }),
    ).rejects.toThrow(/overlap|inside/i);
    await expect(protectDirectory(input, { output: root })).rejects.toThrow();
    expect(await readdir(input)).toEqual([]);
  });
  it("rejects symbolic links without copying their targets", async () => {
    const { input, root, output } = await fixture();
    await writeFile(join(root, "outside"), "private");
    await symlink(join(root, "outside"), join(input, "link.js"));
    await expect(protectDirectory(input, { output })).rejects.toThrow(
      /symbolic|symlink/i,
    );
  });
  it("rolls back invalid JavaScript and does not publish partial output", async () => {
    const { input, root, output } = await fixture();
    await writeFile(join(input, "bad.js"), "const = broken");
    await expect(protectDirectory(input, { output })).rejects.toThrow();
    expect(await readdir(root)).toEqual(["dist"]);
  });
  it("honors exclusions but strips map links in excluded code", async () => {
    const { input, output } = await fixture();
    await mkdir(join(input, "vendor"));
    await writeFile(
      join(input, "vendor/lib.js"),
      "/*# sourceMappingURL=lib.js.map */\nglobalThis.vendor = 7;",
    );
    await protectDirectory(input, {
      output,
      config: { obfuscation: { exclude: ["vendor/**"] } },
    });
    expect(await readFile(join(output, "vendor/lib.js"), "utf8")).toContain(
      "globalThis.vendor = 7;",
    );
    expect(await readFile(join(output, "vendor/lib.js"), "utf8")).not.toContain(
      "sourceMappingURL",
    );
  });
  it("keeps CSS strings containing sourceMappingURL while removing actual comments", async () => {
    const { input, output } = await fixture();
    await writeFile(
      join(input, "app.css"),
      'a::after{content:"/*# sourceMappingURL=visible */"}/*# sourceMappingURL=app.css.map */',
    );
    await protectDirectory(input, { output });
    const css = await readFile(join(output, "app.css"), "utf8");
    expect(css).toContain('content:"/*# sourceMappingURL=visible */"');
    expect(css).not.toContain("app.css.map");
  });
  it("rejects private artifacts inside public output", async () => {
    const { input, output } = await fixture();
    await expect(
      protectDirectory(input, {
        output,
        privateArtifactsDir: join(output, "private"),
      }),
    ).rejects.toThrow(/overlap|inside/i);
  });
});
describe("source and secret scan", () => {
  it("reports paths and categories without leaking matched secret values", async () => {
    const { input } = await fixture();
    await writeFile(
      join(input, "app.js"),
      'const token = "AKIA1234567890ABCDEF"; console.log(token);',
    );
    await writeFile(join(input, "app.js.map"), "{}");
    const findings = await scanDirectory(input);
    expect(findings.some((f) => f.category === "source-map")).toBe(true);
    expect(findings.some((f) => f.category === "potential-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain("AKIA1234567890ABCDEF");
  });
});
it("removes inline HTML JavaScript and style source maps while preserving strings", async () => {
  const { input, output } = await fixture();
  await writeFile(
    join(input, "index.html"),
    '<html><head><style>a{color:red}/*# sourceMappingURL=data:application/json;base64,secret */</style></head><body><script>const literal = "//# sourceMappingURL=keep";\n//# sourceMappingURL=data:application/json;base64,secret\n</script></body></html>',
  );
  await protectDirectory(input, { output });
  const html = await readFile(join(output, "index.html"), "utf8");
  expect(html).not.toContain("base64,secret");
  expect(html).toContain("sourceMappingURL=keep");
});
it("rejects possible credentials before obfuscation could conceal the scanner pattern", async () => {
  const { input, output, root } = await fixture();
  await writeFile(
    join(input, "app.js"),
    'globalThis.key="AKIA1234567890ABCDEF";',
  );
  await expect(protectDirectory(input, { output })).rejects.toThrow(
    /credentials/i,
  );
  expect(await readdir(root)).toEqual(["dist"]);
});
it("keeps input maps and generated maps in collision-free private namespaces", async () => {
  const { input, output } = await fixture();
  await mkdir(join(input, "original"));
  await writeFile(join(input, "app.js"), "globalThis.main=1;");
  await writeFile(join(input, "app.js.map"), "original map must survive");
  await writeFile(join(input, "original/app.js"), "globalThis.nested=2;");
  await protectDirectory(input, {
    output,
    config: { sourceMaps: { privateArtifacts: true } },
  });
  expect(
    await readFile(
      join(`${output}.private-maps`, "input-maps/app.js.map"),
      "utf8",
    ),
  ).toBe("original map must survive");
  expect(
    JSON.parse(
      await readFile(
        join(`${output}.private-maps`, "generated-maps/original/app.js.map"),
        "utf8",
      ),
    ).version,
  ).toBe(3);
});
it("reports missing SRI and uncertain CSP without claiming server header state", async () => {
  const { input } = await fixture();
  await writeFile(join(input, "index.html"), '<script src="app.js"></script>');
  await writeFile(join(input, "app.js"), "globalThis.app=1;");
  const findings = await scanDirectory(input);
  expect(findings.some((f) => f.category === "integrity-policy")).toBe(true);
  expect(
    findings.some(
      (f) => f.category === "security-policy" && f.message.includes("HTTP"),
    ),
  ).toBe(true);
});
