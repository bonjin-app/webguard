import { describe, expect, it } from "vitest";
import { withWebGuard } from "../../packages/npm/src/next";

describe("Next client compiler output scope", () => {
  it.each<{
    title: string;
    source: string;
    syntheticValue?: string;
    sidecar?: string;
    late?: boolean;
  }>([
    {
      title: "preserves server helpers while protecting public JavaScript",
      source: "globalThis.browserResult = 21 * 2;",
      syntheticValue: undefined,
    },
    {
      title:
        "rejects detectable browser credentials before obfuscation without exposing values",
      source:
        'globalThis.browserResult = { password: "synthetic-review-value-123456" };',
      syntheticValue: "synthetic-review-value-123456",
    },
    ...[
      "static/chunks/app.js.gz",
      "static/chunks/app.mjs.br",
      "static/styles.css.gz.br",
      "static/chunks/app.js.map.gz",
      "static/chunks/app.js.map.br.gz",
    ].flatMap((sidecar) =>
      [false, true].map((late) => ({
        title: `rejects ${late ? "late" : "early"} public sidecar ${sidecar}`,
        source: "globalThis.browserResult = 21 * 2;",
        sidecar,
        late,
      })),
    ),
  ])("$title", async ({ source, syntheticValue, sidecar, late }) => {
    const server = "self.__SERVER_MANIFEST = { original: true };";
    const assets = new Map([
      [
        "static/chunks/app.js",
        {
          name: "static/chunks/app.js",
          source: { source: () => source },
          info: {},
        },
      ],
      [
        "server/middleware-build-manifest.js",
        {
          name: "server/middleware-build-manifest.js",
          source: { source: () => server },
          info: {},
        },
      ],
    ]);
    const addSidecar = () => {
      if (sidecar)
        assets.set(sidecar, {
          name: sidecar,
          source: { source: () => "untrusted compressed original" },
          info: {},
        });
    };
    if (!late) addSidecar();
    const transforms: (() => Promise<void>)[] = [];
    const reports: (() => void)[] = [];
    const compilation = {
      chunks: [{ files: ["static/chunks/app.js"] }],
      chunkGraph: {
        getChunkModulesIterable: () => [{ resource: "/app/src/app.js" }],
      },
      hooks: {
        processAssets: {
          tapPromise(_options: unknown, callback: () => Promise<void>) {
            transforms.push(callback);
          },
          tap(_options: unknown, callback: () => void) {
            reports.push(callback);
          },
        },
      },
      getAssets: () => [...assets.values()],
      updateAsset(name: string, source: { source(): string }, info: object) {
        assets.set(name, { name, source, info });
      },
    };
    class RawSource {
      constructor(private code: string) {}
      source() {
        return this.code;
      }
    }
    const compiler = {
      context: "/app",
      webpack: {
        version: "5.112.0",
        Compilation: {
          PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE: 400,
          PROCESS_ASSETS_STAGE_REPORT: 5000,
        },
        sources: { RawSource },
      },
      hooks: {
        thisCompilation: {
          tap(_name: string, callback: (value: typeof compilation) => void) {
            callback(compilation);
          },
        },
      },
    };
    const configured = withWebGuard({}, { runtime: false });
    const output = configured.webpack({}, { dev: false, isServer: false });
    const plugin = output.plugins![0] as { apply(compiler: unknown): void };
    plugin.apply(compiler);
    if (sidecar && !late) {
      await expect(transforms[0]!()).rejects.toThrow(
        sidecar.includes(".map.")
          ? "refuses public source maps"
          : "refuses precompressed code",
      );
      expect(assets.get("static/chunks/app.js")!.source.source()).toBe(source);
      expect(
        assets.get("server/middleware-build-manifest.js")!.source.source(),
      ).toBe(server);
      return;
    }
    if (syntheticValue) {
      const failure = await transforms[0]!().then(
        () => undefined,
        (error: Error) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(failure?.message).toContain(
        "Potential credentials detected before protection",
      );
      expect(failure?.message).not.toContain(syntheticValue);
      expect(assets.get("static/chunks/app.js")!.source.source()).toBe(source);
      expect(
        assets.get("server/middleware-build-manifest.js")!.source.source(),
      ).toBe(server);
      return;
    }
    for (const transform of transforms) await transform();
    expect(
      assets.get("server/middleware-build-manifest.js")!.source.source(),
    ).toBe(server);
    expect(assets.get("static/chunks/app.js")!.source.source()).not.toBe(
      source,
    );
    if (sidecar && late) {
      addSidecar();
      expect(() => reports[0]!()).toThrow(
        sidecar.includes(".map.")
          ? "refuses public source maps"
          : "refuses precompressed code",
      );
    } else for (const report of reports) report();
  });
});
