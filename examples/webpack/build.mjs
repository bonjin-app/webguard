import webpack from "webpack";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./", import.meta.url));
await new Promise((resolve, reject) => {
  const compiler = webpack({
    context: root,
    mode: "production",
    entry: "./src/main.js",
    devtool: "source-map",
    output: {
      path: root + "dist/assets",
      filename: "app.js",
      chunkFilename: "[name].[contenthash].js",
      clean: true,
    },
  });
  compiler.run((error, stats) => {
    compiler.close((closeError) => {
      if (error || closeError) reject(error ?? closeError);
      else if (stats?.hasErrors())
        reject(new Error(stats.toString("errors-only")));
      else resolve();
    });
  });
});
await mkdir(root + "dist", { recursive: true });
await copyFile(root + "index.html", root + "dist/index.html");
await copyFile(root + "style.css", root + "dist/style.css");
