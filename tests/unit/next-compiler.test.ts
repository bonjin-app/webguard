import { describe, expect, it } from "vitest";
import { withWebGuard } from "../../packages/npm/src/next";

describe("Next client compiler output scope", () => {
  it("preserves server helper bytes emitted by the client compiler while protecting public JavaScript", async () => {
    const source = "globalThis.browserResult = 21 * 2;";
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
    for (const transform of transforms) await transform();
    expect(
      assets.get("server/middleware-build-manifest.js")!.source.source(),
    ).toBe(server);
    expect(assets.get("static/chunks/app.js")!.source.source()).not.toBe(
      source,
    );
    for (const report of reports) report();
  });
});
