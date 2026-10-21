import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./", import.meta.url));
const require = createRequire(import.meta.url);
await mkdir(root + "dist/assets", { recursive: true });
await copyFile(require.resolve("jquery"), root + "dist/assets/jquery.js");
for (const file of ["index.html", "style.css"])
  await copyFile(root + file, root + "dist/" + file);
await copyFile(root + "src/main.js", root + "dist/assets/app.js");
