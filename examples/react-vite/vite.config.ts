import { defineConfig } from "vite";
import { webguardApp } from "@webguard/vite-plugin";
export default defineConfig({
  plugins: [
    webguardApp({
      runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
    }),
  ],
  build: { license: { fileName: "third-party-licenses.md" }, target: "es2022" },
});
