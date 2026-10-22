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

it("uses encoded strings for Strict and High without changing Standard or explicit overrides", () => {
  expect(
    resolveConfig({ preset: "strict" }).obfuscation.stringArrayEncoding,
  ).toBe("rc4");
  expect(
    resolveConfig({ obfuscation: { level: "high" } }).obfuscation
      .stringArrayEncoding,
  ).toBe("rc4");
  expect(resolveConfig().obfuscation.stringArrayEncoding).toBe("none");
  expect(
    resolveConfig({
      preset: "strict",
      obfuscation: { stringArrayEncoding: "none" },
    }).obfuscation.stringArrayEncoding,
  ).toBe("none");
  expect(
    resolveConfig({ preset: "strict", obfuscation: { level: "basic" } })
      .obfuscation.stringArrayEncoding,
  ).toBe("none");
});

describe("configuration data boundaries", () => {
  it.each([
    ["config", Object.create({ preset: "basic" })],
    ["obfuscation", { obfuscation: Object.create({ enabled: false }) }],
    ["sourceMaps", { sourceMaps: Object.create({ privateArtifacts: true }) }],
    ["integrity", { integrity: Object.create({ enabled: false }) }],
  ])("rejects custom prototypes in %s", (_label, input) => {
    expect(() => resolveConfig(input as never)).toThrow(TypeError);
  });

  it.each(["config", "obfuscation", "sourceMaps", "integrity"] as const)(
    "rejects hidden and symbolic unknown %s options",
    (section) => {
      for (const key of ["typo", Symbol("typo")]) {
        const object = Object.defineProperty({}, key, { value: false });
        const input = section === "config" ? object : { [section]: object };
        expect(() => resolveConfig(input as never)).toThrow(TypeError);
      }
    },
  );

  it.each([
    ["config", "obfuscation", {}],
    ["obfuscation", "enabled", false],
    ["obfuscation", "level", "high"],
    ["sourceMaps", "privateArtifacts", true],
    ["integrity", "enabled", false],
  ] as const)(
    "rejects %s accessors without executing them",
    (section, key, value) => {
      let reads = 0;
      const object = Object.defineProperty({}, key, {
        enumerable: true,
        get() {
          reads++;
          return value;
        },
      });
      const input = section === "config" ? object : { [section]: object };
      expect(() => resolveConfig(input as never)).toThrow(TypeError);
      expect(reads).toBe(0);
    },
  );

  it("ignores polluted prototype policy fields at the top and nested levels", () => {
    const pollution = {
      obfuscation: { enabled: false },
      sourceMaps: { privateArtifacts: true },
      integrity: { enabled: false, generateManifest: false },
      enabled: false,
      level: "basic",
      stringArrayEncoding: "none",
      privateArtifacts: true,
      generateManifest: false,
    };
    const descriptors = new Map(
      Object.keys(pollution).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(Object.prototype, key),
      ]),
    );
    let inherited, nested;
    try {
      for (const [key, value] of Object.entries(pollution))
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          value,
        });
      inherited = resolveConfig({ preset: "strict" });
      nested = resolveConfig({
        preset: "strict",
        obfuscation: {},
        sourceMaps: {},
        integrity: {},
      });
    } finally {
      for (const [key, descriptor] of descriptors)
        if (descriptor)
          Object.defineProperty(Object.prototype, key, descriptor);
        else Reflect.deleteProperty(Object.prototype, key);
    }
    for (const config of [inherited, nested]) {
      expect(config?.obfuscation).toMatchObject({
        enabled: true,
        level: "high",
        stringArrayEncoding: "rc4",
      });
      expect(config?.sourceMaps.privateArtifacts).toBe(false);
      expect(config?.integrity).toEqual({
        enabled: true,
        generateManifest: true,
      });
    }
  });

  it.each([
    "include",
    "exclude",
    "reservedNames",
    "reservedProperties",
  ] as const)(
    "rejects sparse %s lists instead of returning undefined entries",
    (key) => {
      expect(() =>
        resolveConfig({ obfuscation: { [key]: new Array(1) } }),
      ).toThrow(TypeError);
    },
  );

  it.each([
    "include",
    "exclude",
    "reservedNames",
    "reservedProperties",
  ] as const)("rejects accessor entries in %s without invoking them", (key) => {
    let reads = 0;
    const accessor: string[] = [];
    Object.defineProperty(accessor, "0", {
      get() {
        reads++;
        return ".*";
      },
    });
    expect(() => resolveConfig({ obfuscation: { [key]: accessor } })).toThrow(
      TypeError,
    );
    expect(reads).toBe(0);
  });

  it.each([
    "include",
    "exclude",
    "reservedNames",
    "reservedProperties",
  ] as const)("rejects custom iterators in %s without invoking them", (key) => {
    let reads = 0;
    const iterable = ["valid"];
    Object.defineProperty(iterable, Symbol.iterator, {
      value: function* () {
        reads++;
        yield "**/*";
      },
    });
    expect(() => resolveConfig({ obfuscation: { [key]: iterable } })).toThrow(
      TypeError,
    );
    expect(reads).toBe(0);
  });

  it("preserves explicit own data and detached lists from null-prototype inputs", () => {
    const include = Object.setPrototypeOf(["assets/*.js"], null);
    const input = Object.defineProperties(Object.create(null), {
      preset: { value: "strict" },
      obfuscation: {
        value: Object.assign(Object.create(null), { enabled: false, include }),
      },
      sourceMaps: {
        value: Object.assign(Object.create(null), { privateArtifacts: true }),
      },
      integrity: {
        value: Object.assign(Object.create(null), {
          enabled: false,
          generateManifest: false,
        }),
      },
    });
    const config = resolveConfig(input);
    expect(config.obfuscation.enabled).toBe(false);
    expect(config.sourceMaps.privateArtifacts).toBe(true);
    expect(config.integrity).toEqual({
      enabled: false,
      generateManifest: false,
    });
    config.obfuscation.include.push("more.js");
    expect(include.length).toBe(1);
    expect(config.obfuscation.include).toEqual(["assets/*.js", "more.js"]);
  });
});
