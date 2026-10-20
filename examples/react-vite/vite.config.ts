import { defineConfig } from "vite";
import { webguard } from "@webguard/vite-plugin";
export default defineConfig({
  plugins: [webguard()],
  build: { license: { fileName: "third-party-licenses.md" }, target: "es2022" },
});
