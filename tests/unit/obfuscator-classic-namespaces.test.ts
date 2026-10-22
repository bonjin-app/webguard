import { afterEach, expect, it, vi } from "vitest";
import { createContext, runInContext } from "node:vm";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { obfuscate, createObfuscatorOptions } from "@webguard/obfuscator";

const first =
  'globalThis.readFirst=function(){const item={label:"first private price 107",amount:41};return item.label+":"+item.amount;};';
const second =
  'globalThis.readSecond=function(){const item={label:"second private price 5",amount:82};return item.label+":"+item.amount;};';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([19, 0])(
  "keeps earlier classic-script delayed calls valid after another transform (seed %s)",
  async (seed) => {
    const a = await obfuscate(first, {
      level: "high",
      seed,
      inputFileName: "assets/first.js",
    });
    const b = await obfuscate(second, {
      level: "high",
      seed,
      inputFileName: "assets/second.js",
    });
    const context = createContext({}, { codeGeneration: { strings: false } });
    try {
      runInContext(a.code, context, { timeout: 1000 });
      expect(runInContext("readFirst()", context, { timeout: 1000 })).toBe(
        "first private price 107:41",
      );
      runInContext(b.code, context, { timeout: 1000 });
      for (let repeat = 0; repeat < 3; repeat++)
        expect(
          runInContext("[readFirst(), readSecond()]", context, {
            timeout: 1000,
          }),
        ).toEqual(["first private price 107:41", "second private price 5:82"]);
    } catch (error) {
      const directory = await mkdtemp(join(tmpdir(), "webguard-classic-red-"));
      await Promise.all([
        writeFile(join(directory, "first.source.js"), first),
        writeFile(join(directory, "second.source.js"), second),
        writeFile(join(directory, "first.protected.js"), a.code),
        writeFile(join(directory, "second.protected.js"), b.code),
        writeFile(
          join(directory, "failure.json"),
          JSON.stringify({ seed, error: String(error) }, null, 2) + "\n",
        ),
      ]);
      throw new Error(`Classic-script regression; fixtures: ${directory}`, {
        cause: error,
      });
    }
  },
);

it("makes fixed-seed output repeatable while separating source, filename, seed and settings", async () => {
  const options = {
    level: "high" as const,
    seed: 19,
    inputFileName: "assets/first.js",
    sourceMap: true,
  };
  const a = await obfuscate(first, options);
  const b = await obfuscate(first, options);
  expect(b.code).toBe(a.code);
  expect(b.map).toBe(a.map);
  const prefix = createObfuscatorOptions(options, first).identifiersPrefix;
  expect(prefix).toMatch(/^[$A-Z_a-z][$\w]+$/);
  for (const [source, patch] of [
    [second, {}],
    [first, { inputFileName: "assets/second.js" }],
    [first, { seed: 9 }],
    [first, { level: "standard" as const }],
  ] as const)
    expect(
      createObfuscatorOptions({ ...options, ...patch }, source)
        .identifiersPrefix,
    ).not.toBe(prefix);
});

it("gives randomized or unidentified transforms independent namespaces even without crypto entropy", () => {
  vi.stubGlobal("crypto", undefined);
  vi.spyOn(Math, "random").mockReturnValue(0);
  for (const [options, source] of [
    [{ seed: 0 }, first],
    [{ seed: 19 }, undefined],
  ] as const) {
    const a = createObfuscatorOptions(options, source).identifiersPrefix;
    const b = createObfuscatorOptions(options, source).identifiersPrefix;
    expect(a).toMatch(/^[$A-Z_a-z][$\w]+$/);
    expect(b).not.toBe(a);
  }
});

it("honors an explicit caller namespace exactly and leaves user globals public", async () => {
  expect(
    createObfuscatorOptions(
      { seed: 19, identifiersPrefix: "caller_scope_" },
      first,
    ).identifiersPrefix,
  ).toBe("caller_scope_");
  const result = await obfuscate(first, {
    level: "high",
    seed: 19,
    identifiersPrefix: "caller_scope_",
  });
  const context = createContext({});
  runInContext(result.code, context, { timeout: 1000 });
  expect(runInContext("readFirst()", context, { timeout: 1000 })).toBe(
    "first private price 107:41",
  );
});
