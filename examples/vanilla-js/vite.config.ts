import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { webguardApp } from "@webguard/vite-plugin";
export default defineConfig({
  plugins: [webguardApp({ preset: "standard", runtime: false })],
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        about: fileURLToPath(new URL("./about/index.html", import.meta.url)),
      },
    },
  },
});
