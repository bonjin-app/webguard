import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chunkPreset,
  isPureFrameworkChunk,
  type ModuleOrigin,
} from "../../packages/npm/src/next-classification";

describe("Next framework protection tiers", () => {
  it("provides conservative module-graph classification for the browser compiler", () => {
    expect(
      existsSync(
        new URL(
          "../../packages/npm/src/next-classification.ts",
          import.meta.url,
        ),
      ),
    ).toBe(true);
  });

  it("lowers only complete third-party module graphs, including concatenated modules", () => {
    const react = { resource: "/app/node_modules/react/index.js" };
    const next = { resource: "/app/node_modules/next/dist/client.js" };
    expect(isPureFrameworkChunk([{ modules: [react, next] }], "/app")).toBe(
      true,
    );
    expect(
      isPureFrameworkChunk(
        [{ modules: [react, { resource: "/app/src/counter.js" }] }],
        "/app",
      ),
    ).toBe(false);
    expect(
      isPureFrameworkChunk(
        [{ resource: "/workspace/node_modules/react/index.js" }],
        "/workspace/apps/site",
      ),
    ).toBe(true);
  });

  it.each(
    (
      [
        [],
        [{}],
        [{ resource: "webpack/runtime" }],
        [{ resource: "/app/src/main.js?resolved=/node_modules/react" }],
        [{ resource: "/app/node_modules/uulab-webguard/dist/next-runtime.js" }],
        [{ resource: "/app/node_modules/@webguard/browser/index.js" }],
        [{ resource: "/app/vendor/app.js" }],
        [{ modules: [] }],
      ] as ModuleOrigin[][]
    ).map((modules) => ({ modules })),
  )(
    "keeps unknown, application and SDK origins at requested protection: %j",
    ({ modules }) => {
      expect(isPureFrameworkChunk(modules, "/app")).toBe(false);
    },
  );

  it("keeps cyclic or missing module origin information conservative", () => {
    const cycle: ModuleOrigin = {};
    cycle.modules = [cycle];
    expect(isPureFrameworkChunk([cycle], "/app")).toBe(false);
    expect(
      isPureFrameworkChunk(
        [{ resource: "/outer/node_modules/site/app/page.js" }],
        "/outer/node_modules/site",
      ),
    ).toBe(false);
  });

  it("caps pure framework protection at Standard, preserves Basic, and supports explicit inherit", () => {
    expect(chunkPreset("strict", true, "standard")).toBe("standard");
    expect(chunkPreset("strict", false, "standard")).toBe("strict");
    expect(chunkPreset("basic", true, "standard")).toBe("basic");
    expect(chunkPreset("strict", true, "inherit")).toBe("strict");
  });
});
