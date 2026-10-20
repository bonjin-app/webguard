import { defineConfig } from "vite";
import { webguardApp } from "@webguard/vite-plugin";
export default defineConfig({
  plugins: [
    webguardApp({
      preset: "standard",
      runtime: false,
      obfuscation: { stringArrayEncoding: "base64" },
    }),
  ],
});
