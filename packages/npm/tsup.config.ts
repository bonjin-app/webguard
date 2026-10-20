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
    entry: { index: "src/index.ts", headers: "src/headers.ts" },
    platform: "node",
  },
  {
    ...common,
    entry: { browser: "src/browser.ts", client: "src/client.ts" },
    platform: "browser",
  },
]);
