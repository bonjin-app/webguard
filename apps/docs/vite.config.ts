import { defineConfig } from "vite";
import { webguard } from "@webguard/vite-plugin";
export default defineConfig({
  plugins: [webguard({ preset: "strict" })],
  build: { license: { fileName: "third-party-licenses.md" }, sourcemap: false },
});
