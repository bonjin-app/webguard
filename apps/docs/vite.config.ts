import { defineConfig } from "vite";
import { webguardApp } from "@webguard/vite-plugin";
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
});
