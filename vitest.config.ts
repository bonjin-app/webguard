import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@webguard/obfuscator/options": fileURLToPath(
        new URL("./packages/obfuscator/src/options.ts", import.meta.url),
      ),
      ...Object.fromEntries(
        [
          "shared",
          "core",
          "obfuscator",
          "browser",
          "integrity",
          "cli",
          "vite-plugin",
        ].map((p) => [
          `@webguard/${p}`,
          fileURLToPath(
            new URL(`./packages/${p}/src/index.ts`, import.meta.url),
          ),
        ]),
      ),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
