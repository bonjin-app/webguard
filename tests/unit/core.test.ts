import { describe, expect, it } from "vitest";
import { defineConfig, resolveConfig } from "@webguard/core";

describe("configuration", () => {
  it("defaults string-array encoding to none and resolves explicit encodings", () => {
    expect(resolveConfig().obfuscation.stringArrayEncoding).toBe("none");
    for (const stringArrayEncoding of ["none", "base64", "rc4"] as const) {
      expect(
        resolveConfig({ obfuscation: { stringArrayEncoding } }).obfuscation
          .stringArrayEncoding,
      ).toBe(stringArrayEncoding);
    }
    expect(() =>
      resolveConfig({ obfuscation: { stringArrayEncoding: "hex" } } as never),
    ).toThrow();
    expect(() =>
      resolveConfig({
        preset: "basic",
        obfuscation: { stringArrayEncoding: "base64" },
      }),
    ).toThrow();
  });
  it("uses safe standard defaults and output-file patterns", () => {
    const config = resolveConfig();
    expect(config.preset).toBe("standard");
    expect(config.obfuscation).toMatchObject({
      enabled: true,
      level: "standard",
      include: ["**/*.{js,mjs,cjs}"],
      renameProperties: false,
      deadCodeInjection: false,
    });
    expect(config.sourceMaps).toEqual({
      public: false,
      privateArtifacts: false,
    });
    expect(config.integrity).toEqual({ enabled: true, generateManifest: true });
  });
  it("resolves basic, strict, and custom presets", () => {
    expect(resolveConfig({ preset: "basic" }).obfuscation.level).toBe("basic");
    expect(resolveConfig({ preset: "basic" }).integrity.enabled).toBe(false);
    expect(resolveConfig({ preset: "strict" }).obfuscation).toMatchObject({
      level: "high",
      renameProperties: false,
      deadCodeInjection: false,
    });
    expect(resolveConfig({ preset: "custom" }).obfuscation.level).toBe(
      "standard",
    );
  });
  it("merges explicit false values and clones input and default arrays", () => {
    const input = defineConfig({
      obfuscation: { enabled: false, reservedNames: ["publicApi"] },
      integrity: { enabled: false },
      sourceMaps: { privateArtifacts: true },
    });
    const config = resolveConfig(input);
    expect(config.obfuscation.enabled).toBe(false);
    expect(config.sourceMaps.privateArtifacts).toBe(true);
    config.obfuscation.reservedNames.push("another");
    config.obfuscation.include.push("changed");
    expect(input.obfuscation.reservedNames).toEqual(["publicApi"]);
    expect(resolveConfig().obfuscation.include).toEqual(["**/*.{js,mjs,cjs}"]);
    expect(defineConfig(input)).toBe(input);
  });
  it.each([
    { preset: "unknown" },
    { preset: null },
    { preset: "basic", obfuscation: { deadCodeInjection: true } },
    {
      obfuscation: {
        level: "basic",
        renameProperties: true,
        reservedProperties: ["api"],
      },
    },
    { sourceMaps: { public: true } },
    { obfuscation: { level: "maximum" } },
    { obfuscation: { enabled: "yes" } },
    { obfuscation: { seed: NaN } },
    { obfuscation: { include: [1] } },
    { obfuscation: { reservedNames: ["["] } },
    { obfuscation: { unknown: true } },
    { integrity: null },
    { unsupported: true },
    { obfuscation: { renameProperties: true } },
  ])("rejects invalid configuration %j", (input) => {
    expect(() => resolveConfig(input as never)).toThrow();
  });
});
