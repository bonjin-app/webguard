import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { protectDirectory } from "../packages/cli/dist/index.js";

const repository = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const output = args.includes("--output")
  ? resolve(args[args.indexOf("--output") + 1])
  : join(repository, ".demo-dist/ssr-templates");
await mkdir(output, { recursive: true });
if ((await readdir(output)).length)
  throw new Error(
    "SSR output must be empty; choose a fresh --output directory",
  );
const temp = await mkdtemp(join(tmpdir(), "webguard-ssr-build-"));
try {
  const input = join(temp, "input");
  await mkdir(input);
  await copyFile(
    join(repository, "packages/browser/dist/webguard.global.js"),
    join(input, "webguard.global.js"),
  );
  for (const file of ["init.js", "app.js", "style.css"])
    await copyFile(
      join(repository, "examples/ssr-templates/assets-src", file),
      join(input, file),
    );
  const report = await protectDirectory(input, {
    output: join(temp, "protected"),
    privateArtifactsDir: join(temp, "maps"),
    config: {
      preset: "strict",
      sourceMaps: { public: false, privateArtifacts: true },
    },
  });
  const publicDir = join(temp, "public/assets");
  const privateDir = join(temp, "private");
  await mkdir(publicDir, { recursive: true });
  await mkdir(privateDir);
  const assets = {};
  // Deliberate allowlist: never publish reports, source maps, templates or server files.
  for (const name of ["webguard.global.js", "init.js", "app.js", "style.css"]) {
    const bytes = await readFile(join(temp, "protected", name));
    if (bytes.includes(Buffer.from("sourceMappingURL")))
      throw new Error(`Unexpected source map reference: ${name}`);
    await writeFile(join(publicDir, name), bytes);
    assets[name] = {
      integrity:
        "sha384-" + createHash("sha384").update(bytes).digest("base64"),
      type: name.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/javascript; charset=utf-8",
    };
  }
  const headers = {
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
  };
  await copyFile(
    join(repository, "examples/ssr-templates/template.html"),
    join(privateDir, "template.html"),
  );
  await writeFile(
    join(privateDir, "policy.json"),
    JSON.stringify({ preset: "strict", headers, assets }, null, 2) + "\n",
  );
  // Reports/maps remain beside the public root, never inside it.
  const safeReport = {
    preset: report.preset,
    files: report.files,
    limitations: report.limitations,
  };
  await writeFile(
    join(privateDir, "webguard-report.json"),
    JSON.stringify(safeReport, null, 2) + "\n",
  );
  await rename(join(temp, "maps"), join(privateDir, "maps"));
  await rename(dirname(publicDir), join(output, "public"));
  await rename(privateDir, join(output, "private"));
  console.log(
    `Protected SSR client assets prepared at ${output}; serve only public/assets through the supplied routers.`,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
