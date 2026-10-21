import { defineConfig } from "vite";
import { webguard } from "@webguard/vite-plugin";
export default defineConfig({
  plugins: [webguard({ preset: "strict" })],
  build: { license: { fileName: "third-party-licenses.md" }, sourcemap: false },
  worker: {
    format: "es",
    plugins: () => [
      webguard({
        preset: "strict",
        obfuscation: { exclude: ["**/index.browser-*.js"] },
      }),
      // The third-party transform engine is large. Protect it without High's
      // control-flow expansion; the application worker itself remains Strict.
      webguard({
        preset: "standard",
        obfuscation: { include: ["**/index.browser-*.js"] },
      }),
    ],
  },
});
