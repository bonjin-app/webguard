import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  obfuscate,
  createObfuscatorOptions,
} from "../../packages/obfuscator/src/index";

const first =
  'globalThis.readFirst=function(){const item={label:"first private price 107",amount:41};return item.label+":"+item.amount;};';
const second =
  'globalThis.readSecond=function(){const item={label:"second private price 5",amount:82};return item.label+":"+item.amount;};';

for (const seed of [19, 0]) {
  test(`preserves delayed classic calls after later scripts load (seed ${seed})`, async ({
    page,
  }, testInfo) => {
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
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    try {
      await page.setContent("<h1>Classic-script namespace regression</h1>");
      await page.addScriptTag({ content: a.code });
      expect(await page.evaluate("readFirst()")).toBe(
        "first private price 107:41",
      );
      await page.addScriptTag({ content: b.code });
      for (let repeat = 0; repeat < 3; repeat++)
        expect(await page.evaluate("[readFirst(), readSecond()]")).toEqual([
          "first private price 107:41",
          "second private price 5:82",
        ]);
      expect(errors).toEqual([]);
    } catch (error) {
      const directory = testInfo.outputPath("fixture");
      await mkdir(directory, { recursive: true });
      for (const [name, code] of Object.entries({
        "first.source.js": first,
        "second.source.js": second,
        "first.protected.js": a.code,
        "second.protected.js": b.code,
        "failure.json": JSON.stringify(
          { seed, error: String(error), errors },
          null,
          2,
        ),
      }))
        await writeFile(`${directory}/${name}`, code);
      throw error;
    }
  });
}

test("uses the same fixed-seed namespace in Node and browser without Node builtins", async ({
  page,
}) => {
  const options = {
    level: "high" as const,
    seed: 19,
    inputFileName: "assets/first.js",
  };
  const bundle = await build({
    entryPoints: [
      fileURLToPath(
        new URL("../../packages/obfuscator/src/options.ts", import.meta.url),
      ),
    ],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "NamespaceOptions",
    write: false,
  });
  await page.setContent("<h1>Browser-compatible transformation options</h1>");
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  const browserPrefix = await page.evaluate(
    ({ source, options }) => {
      const scope = window as unknown as {
        NamespaceOptions: typeof import("../../packages/obfuscator/src/options");
      };
      return scope.NamespaceOptions.createObfuscatorOptions(options, source)
        .identifiersPrefix;
    },
    { source: first, options },
  );
  expect(browserPrefix).toBe(
    createObfuscatorOptions(options, first).identifiersPrefix,
  );
});
