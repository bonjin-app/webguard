import { defineConfig } from "tsup";
const common = {
  tsconfig: "../../tsconfig.json",
  format: ["esm" as const],
  splitting: false,
  sourcemap: false,
  clean: false,
  noExternal: [/^@webguard\//],
  dts: { resolve: [/^@webguard\//] },
};
export default defineConfig([
  {
    ...common,
    entry: {
      index: "src/index.ts",
      headers: "src/headers.ts",
      verify: "src/verify.ts",
      check: "src/check.ts",
      server: "src/server.ts",
      serve: "src/serve.ts",
      build: "src/build.ts",
      cli: "src/cli.ts",
    },
    platform: "node",
  },
  {
    ...common,
    entry: { browser: "src/browser.ts", client: "src/client.ts" },
    platform: "browser",
  },
  {
    ...common,
    entry: { "browser.global": "src/browser.ts" },
    format: ["iife"],
    globalName: "WebGuardSDK",
    platform: "browser",
    dts: false,
    outExtension: () => ({ js: ".js" }),
  },
]);
