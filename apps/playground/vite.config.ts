import { defineConfig } from "vite";
import { webguard, webguardApp } from "@webguard/vite-plugin";
import { siteGuardOptions } from "../site-guard-options";
export default defineConfig({
  plugins: [
    webguardApp({
      preset: "strict",
      headers: false,
      runtime: siteGuardOptions,
    }),
  ],
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
