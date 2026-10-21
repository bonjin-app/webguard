import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./", import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ["src/main.js"],
  outdir: "dist/assets",
  entryNames: "app",
  chunkNames: "[name]-[hash]",
  bundle: true,
  format: "esm",
  splitting: true,
  sourcemap: true,
  minify: true,
});
await mkdir(root + "dist", { recursive: true });
await copyFile(root + "index.html", root + "dist/index.html");
await copyFile(root + "style.css", root + "dist/style.css");
