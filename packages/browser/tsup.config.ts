import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "iife"],
  globalName: "WebGuardSDK",
  dts: true,
  clean: true,
  platform: "browser",
  noExternal: [/.*/],
  outExtension: ({ format }) => ({
    js: format === "iife" ? ".global.js" : ".js",
  }),
  esbuildOptions(options, { format }) {
    if (format === "iife") options.entryNames = "webguard";
  },
});
