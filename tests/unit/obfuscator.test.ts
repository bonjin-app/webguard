import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { execFileSync } from "node:child_process";
import {
  obfuscate,
  stripSourceMapReferences,
  createObfuscatorOptions,
  preserveLicenseComments,
} from "@webguard/obfuscator";

const source = `async function calculate(input) { const descriptiveLocalName = await Promise.resolve(input + 2); return JSON.stringify({publicApi: descriptiveLocalName, unicode: '한글'}); } globalThis.result = calculate(40);`;

describe("obfuscation", () => {
  it("appends exact legal notices while preserving runtime behavior and private maps", async () => {
    const notices = [
      "/*! Third-party MIT notice */",
      "/* @LiCeNsE BSD-2-Clause */",
      "// @preserve attribution",
      "/* COPYRIGHT Example Authors */",
    ];
    const fake = "/* @license this is only a string */";
    const original = `${notices.join("\n")}\n/* ordinary removable comment */\nglobalThis.result = ${JSON.stringify(fake)};\n//# sourceMappingURL=copyright.map`;
    const result = await obfuscate(original, {
      level: "basic",
      seed: 7,
      sourceMap: true,
    });
    for (const notice of notices)
      expect(result.code.split(notice)).toHaveLength(2);
    expect(result.code.endsWith(notices[3]!)).toBe(true);
    expect(result.code).not.toContain("ordinary removable comment");
    expect(result.code).not.toContain("sourceMappingURL");
    expect(
      result.code.split("\n").filter((line) => line === fake),
    ).toHaveLength(0);
    const context: Record<string, unknown> = {};
    runInNewContext(result.code, context, {
      contextCodeGeneration: { strings: false, wasm: false },
    });
    expect(context.result).toBe(fake);
    const map = JSON.parse(result.map!);
    expect(map.version).toBe(3);
    expect(typeof map.mappings).toBe("string");
    expect(map.mappings.length).toBeGreaterThan(0);
    expect(result.protectedBytes).toBe(Buffer.byteLength(result.code));
  });
  it("preserves legal comments only once and distinguishes generated strings from actual notices", () => {
    const notice = "/*! @license MIT */";
    const source = `${notice}\nwith(globalThis){result=42;}\n${notice}`;
    const generated = "with(globalThis){result=42;}";
    expect(preserveLicenseComments(source, generated)).toBe(
      `${generated}\n${notice}`,
    );
    expect(preserveLicenseComments(source, `${generated}\n${notice}`)).toBe(
      `${generated}\n${notice}`,
    );
    const stringCode = `const text = ${JSON.stringify(notice)};`;
    expect(preserveLicenseComments(source, stringCode)).toBe(
      `${stringCode}\n${notice}`,
    );
    expect(
      preserveLicenseComments(
        `const text = ${JSON.stringify(notice)}; /* ordinary */`,
        generated,
      ),
    ).toBe(generated);
  });
  it.each(["base64", "rc4"] as const)(
    "supports %s encoding without hiding module specifiers or adding dynamic code generation",
    async (stringArrayEncoding) => {
      const staticSource = "data:text/javascript,export const base=40";
      const exportSource = "data:text/javascript,export const marker=99";
      const dynamicSource = "data:text/javascript,export default 2";
      const code = `import {base} from ${JSON.stringify(staticSource)}; export {base as forwarded} from ${JSON.stringify(staticSource)}; export * from ${JSON.stringify(exportSource)}; export async function load() { const values=['alpha','beta','gamma','delta','epsilon','zeta','eta','theta']; return [base + (await import(${JSON.stringify(dynamicSource)})).default, values.join('|')]; }`;
      const result = await obfuscate(code, { stringArrayEncoding, seed: 7 });
      for (const path of [staticSource, exportSource, dynamicSource])
        expect(result.code).toContain(path);
      expect(
        createObfuscatorOptions({ stringArrayEncoding }).stringArrayEncoding,
      ).toEqual([stringArrayEncoding]);
      const url = `data:text/javascript;base64,${Buffer.from(result.code).toString("base64")}`;
      const output = execFileSync(
        process.execPath,
        [
          "--disallow-code-generation-from-strings",
          "--input-type=module",
          "-e",
          `const module=await import(${JSON.stringify(url)}); console.log(JSON.stringify([await module.load(), module.forwarded, module.marker]));`,
        ],
        { encoding: "utf8" },
      );
      expect(JSON.parse(output)).toEqual([
        [42, "alpha|beta|gamma|delta|epsilon|zeta|eta|theta"],
        40,
        99,
      ]);
    },
  );
  it("reserves exact module paths and bundler placeholder string values", () => {
    const paths = [
      "./chunk.!~{abc}~.js",
      "./image-__VITE_ASSET__hash__.png",
      "./plain.[x]+.js",
      "./named.[x]+.js",
      "./all-export.js",
      "./image.!~{asset}~.png",
      "./template-__VITE_ASSET__hash__.png",
    ];
    const source = `import ${JSON.stringify(paths[2])}; export {api} from ${JSON.stringify(paths[3])}; export * from ${JSON.stringify(paths[4])}; const asset=${JSON.stringify(paths[1])}; const image=${JSON.stringify(paths[5])}; const template=\`${paths[6]}\`; const lazy=()=>import(${JSON.stringify(paths[0])});`;
    const options = createObfuscatorOptions(
      { stringArrayEncoding: "base64" },
      source,
    );
    for (const value of paths) {
      expect(
        options.reservedStrings?.some((pattern) =>
          new RegExp(pattern).test(value),
        ),
      ).toBe(true);
      expect(
        options.reservedStrings?.some((pattern) =>
          new RegExp(pattern).test("prefix" + value + "suffix"),
        ),
      ).toBe(false);
    }
    expect(createObfuscatorOptions().stringArrayEncoding).toEqual([]);
  });
  it.each(["basic", "standard", "high"] as const)(
    "preserves async and JSON behavior for %s with CSP restrictions",
    async (level) => {
      const result = await obfuscate(source, { level, seed: 7 });
      const context: Record<string, unknown> = {};
      runInNewContext(result.code, context, {
        contextCodeGeneration: { strings: false, wasm: false },
      });
      expect(await context.result).toBe(
        JSON.stringify({ publicApi: 42, unicode: "한글" }),
      );
      expect(result.code).not.toContain("descriptiveLocalName");
      expect(result.originalBytes).toBe(Buffer.byteLength(source));
      expect(result.protectedBytes).toBe(Buffer.byteLength(result.code));
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.map).toBeUndefined();
    },
  );
  it("basic only minifies and renames, without extra transformations", () => {
    expect(createObfuscatorOptions({ level: "basic" })).toMatchObject({
      compact: true,
      simplify: false,
      stringArray: false,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      numbersToExpressions: false,
      transformObjectKeys: false,
      splitStrings: false,
      unicodeEscapeSequence: false,
      target: "browser-no-eval",
      renameGlobals: false,
      debugProtection: false,
      selfDefending: false,
      disableConsoleOutput: false,
    });
  });
  it("preserves reserved identifiers and reserved public properties during opt-in transformations", async () => {
    const result = await obfuscate(
      `function api() { return { publicApi: 42, internalValue: 3 }; } globalThis.result = api()['publicApi'];`,
      {
        level: "high",
        renameProperties: true,
        reservedProperties: ["^publicApi$", "^result$"],
        reservedNames: ["^api$"],
        deadCodeInjection: true,
        seed: 3,
      },
    );
    const context: Record<string, unknown> = {};
    runInNewContext(result.code, context, {
      contextCodeGeneration: { strings: false, wasm: false },
    });
    expect(context.result).toBe(42);
    expect(result.code).toContain("api");
  });
  it("preserves ESM exports and dynamic import", async () => {
    const result = await obfuscate(
      `export async function load() { return (await import('data:text/javascript,export default 42')).default; }`,
      { seed: 9 },
    );
    const url = `data:text/javascript;base64,${Buffer.from(result.code).toString("base64")}`;
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const module = await import(${JSON.stringify(url)}); console.log(await module.load());`,
      ],
      { encoding: "utf8" },
    );
    expect(output.trim()).toBe("42");
  });
  it("returns private maps without linking them in public code", async () => {
    const result = await obfuscate(
      "globalThis.result = 42;\n//# sourceMappingURL=original.js.map",
      { sourceMap: true, inputFileName: "bundle.js" },
    );
    expect(JSON.parse(result.map!).version).toBe(3);
    expect(result.code).not.toContain("sourceMappingURL");
  });
  it("rejects invalid options and unsafe unreserved property transformation", async () => {
    await expect(
      obfuscate("let a=1", { level: "invalid" } as never),
    ).rejects.toThrow();
    await expect(
      obfuscate("let a=1", { renameProperties: true }),
    ).rejects.toThrow();
    await expect(obfuscate("let a=1", { seed: NaN })).rejects.toThrow();
  });
});

describe("source map comment stripping", () => {
  it.each([
    [
      "with statement",
      "globalThis.value = 42; with (globalThis) { result = value; }",
      42,
    ],
    [
      "legacy octal",
      "var legacyOctal = 010; globalThis.result = legacyOctal;",
      8,
    ],
  ])(
    "preserves classic-script behavior for %s without duplicate fallback comment ranges",
    (_name, body, expected) => {
      const code = `/*# sourceMappingURL=before.map */\n${body}\n//# sourceMappingURL=after.map\n`;
      const original: Record<string, unknown> = {};
      const protectedContext: Record<string, unknown> = {};
      runInNewContext(code, original);
      const stripped = stripSourceMapReferences(code);
      runInNewContext(stripped, protectedContext);
      expect(protectedContext.result).toBe(expected);
      expect(protectedContext.result).toBe(original.result);
      expect(stripped).not.toContain("sourceMappingURL");
      expect(stripped).toHaveLength(code.length);
      expect(stripped.split("\n")).toHaveLength(code.split("\n").length);
      expect(stripped).toContain(body);
    },
  );
  it("still rejects JavaScript invalid as both module and classic script", () => {
    expect(() =>
      stripSourceMapReferences("/*# sourceMappingURL=before.map */ const = ;"),
    ).toThrow();
  });
  it("removes actual line and inline block mapping comments while preserving strings, templates, regex, and other comments", () => {
    const code = `const text = "//# sourceMappingURL=literal"; const template = \`/*# sourceMappingURL=literal */\`; const regex = /sourceMappingURL=/; /* keep */\n/*# sourceMappingURL=data:application/json;base64,e30= */ globalThis.result = text;\n//@ sourceMappingURL=old.map\n//# sourceMappingURL=new.map\n`;
    const stripped = stripSourceMapReferences(code);
    expect(stripped).toContain('"//# sourceMappingURL=literal"');
    expect(stripped).toContain("`/*# sourceMappingURL=literal */`");
    expect(stripped).toContain("/* keep */");
    expect(stripped).not.toContain("sourceMappingURL=old.map");
    expect(stripped).not.toContain("sourceMappingURL=new.map");
    expect(stripped).not.toContain("data:application/json");
    expect(stripped.split("\n")).toHaveLength(code.split("\n").length);
  });
  it("preserves token boundaries where block comments are removed", () => {
    expect(
      stripSourceMapReferences("const/*# sourceMappingURL=a */value=1;"),
    ).toMatch(/const\s+value/);
  });
});
