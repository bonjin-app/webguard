import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withWebGuard } from "../../packages/npm/src/next";

describe("Next.js config-only protection", () => {
  it("provides a dedicated integration without requiring the Vite entry", () => {
    expect(
      existsSync(new URL("../../packages/npm/src/next.ts", import.meta.url)),
    ).toBe(true);
  });

  it("preserves the user's hook, output settings and immutable input", async () => {
    const input = {
      entry: async () => ({
        "main-app": { import: ["next-app"], dependOn: "shared" },
        custom: ["custom"],
      }),
      plugins: ["existing"],
      optimization: { minimize: true },
      devtool: "source-map",
    };
    const configured = withWebGuard({
      assetPrefix: "/cdn",
      webpack(config: typeof input) {
        return { ...config, customUserOption: true };
      },
    });
    const output = await configured.webpack(input, {
      dev: false,
      isServer: false,
    });
    expect(configured.assetPrefix).toBe("/cdn");
    expect(output.customUserOption).toBe(true);
    expect(output.plugins).toHaveLength(2);
    expect(input.plugins).toEqual(["existing"]);
    expect(output.devtool).toBe(false);
    expect(output.optimization).toEqual({
      minimize: true,
      realContentHash: true,
    });
    const entries = await (
      output.entry as () => Promise<Record<string, unknown>>
    )();
    expect(entries["main-app"]).toEqual({
      import: [expect.stringContaining("next-runtime.js"), "next-app"],
      dependOn: "shared",
    });
    expect(entries.custom).toEqual(["custom"]);
  });

  it.each([
    { dev: true, isServer: false },
    { dev: false, isServer: true, nextRuntime: "nodejs" },
    { dev: false, isServer: true, nextRuntime: "edge" },
  ])(
    "leaves development and server compilations unchanged: %j",
    async (context) => {
      const input = {
        entry: { main: "server-entry" },
        plugins: [],
        devtool: "source-map",
      };
      const output = await withWebGuard({}).webpack(input, context);
      expect(output).toBe(input);
    },
  );

  it("can disable automatic SDK startup without disabling protection", async () => {
    const input = { entry: { unrelated: "entry" } };
    const output = await withWebGuard({}, { runtime: false }).webpack(input, {
      dev: false,
      isServer: false,
    });
    expect(output.entry).toBe(input.entry);
    expect(output.plugins).toHaveLength(1);
  });

  it("rejects source maps and unsupported configurations instead of claiming protection", () => {
    expect(() => withWebGuard({ productionBrowserSourceMaps: true })).toThrow(
      /sourceMaps:false|productionBrowserSourceMaps:false/,
    );
    expect(() => withWebGuard((() => ({})) as unknown as object)).toThrow(
      /resolved Next config/,
    );
    expect(() => withWebGuard({ webpack: {} })).toThrow(
      /webpack must be a function/,
    );
    expect(() =>
      withWebGuard({}, { runtime: { onThreat() {} } } as never),
    ).toThrow(/serializable/);
    expect(() =>
      withWebGuard({}).webpack(
        { entry: { unsupported: "app" } },
        { dev: false, isServer: false },
      ),
    ).toThrow(/could not locate/);
    expect(() =>
      withWebGuard({
        webpack() {
          return undefined;
        },
      }).webpack({}, { dev: false, isServer: false }),
    ).toThrow(/must return/);
  });

  it("rejects invalid null runtime settings rather than silently replacing them", () => {
    expect(() => withWebGuard({}, { runtime: null } as never)).toThrow(
      /runtime/,
    );
  });

  it("rejects a null preset rather than silently selecting strict", () => {
    expect(() => withWebGuard({}, { preset: null } as never)).toThrow(
      /preset/i,
    );
  });

  it("rejects async webpack hooks because Next itself does not await them", () => {
    expect(() =>
      withWebGuard({
        async webpack(config: object) {
          return config;
        },
      }).webpack({}, { dev: false, isServer: false }),
    ).toThrow(/async webpack/);
  });

  it.each(["--turbopack", "--turbo"])(
    "rejects explicit unsupported production Next CLI mode %s",
    (flag) => {
      const original = process.argv;
      try {
        process.argv = [
          original[0]!,
          "/consumer/node_modules/next/dist/bin/next",
          "build",
          flag,
        ];
        expect(() => withWebGuard({})).toThrow(/Turbopack.*unsupported/);
        process.argv = [
          original[0]!,
          "/consumer/node_modules/next/dist/bin/next",
          "dev",
          flag,
        ];
        expect(() => withWebGuard({})).not.toThrow();
        process.argv = [
          original[0]!,
          "/consumer/unrelated-tool",
          "build",
          flag,
        ];
        expect(() => withWebGuard({})).not.toThrow();
      } finally {
        process.argv = original;
      }
    },
  );

  it("requires explicit Webpack for a recognized Next production CLI, including turbopack config objects", () => {
    const original = process.argv;
    try {
      process.argv = [
        original[0]!,
        "/consumer/node_modules/.bin/next",
        "build",
      ];
      expect(() => withWebGuard({ turbopack: {} })).toThrow(/--webpack/);
      process.argv.push("--webpack");
      expect(() => withWebGuard({ turbopack: {} })).not.toThrow();
    } finally {
      process.argv = original;
    }
  });
});
