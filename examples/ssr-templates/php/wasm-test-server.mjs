// Optional verification adapter, NOT a production server or SDK dependency.
// Executes the unchanged PHP router in WordPress Playground's real PHP 8.4 WASM.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const modules = process.env.WEBGUARD_PHP_WASM_MODULES;
if (!modules)
  throw new Error(
    "Set WEBGUARD_PHP_WASM_MODULES to an isolated node_modules directory",
  );
const { PHP } = await import(
  pathToFileURL(join(modules, "@php-wasm/universal/index.js")).href
);
const { loadNodeRuntime } = await import(
  pathToFileURL(join(modules, "@php-wasm/node/index.js")).href
);
const php = new PHP(
  await loadNodeRuntime("8.4", {
    emscriptenOptions: { processId: process.pid },
  }),
);
for (const directory of [
  "/prepared",
  "/prepared/private",
  "/prepared/public",
  "/prepared/public/assets",
  "/example",
])
  php.mkdir(directory);
const output = process.env.WEBGUARD_SSR_OUTPUT;
for (const file of [
  "private/policy.json",
  "private/template.html",
  "public/assets/webguard.global.js",
  "public/assets/init.js",
  "public/assets/app.js",
  "public/assets/style.css",
])
  php.writeFile("/prepared/" + file, await readFile(join(output, file)));
php.writeFile(
  "/example/router.php",
  await readFile(new URL("./router.php", import.meta.url)),
);
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
let pending = Promise.resolve();
const server = createServer((request, response) => {
  // A single interpreter executes one request at a time.
  pending = pending
    .then(async () => {
      const result = await php.run({
        scriptPath: "/example/router.php",
        relativeUri: request.url,
        method: request.method,
        env: {
          WEBGUARD_SSR_OUTPUT: "/prepared",
          WEBGUARD_BASE_PATH: process.env.WEBGUARD_BASE_PATH ?? "/",
        },
        $_SERVER: { REQUEST_URI: request.url, REQUEST_METHOD: request.method },
      });
      if (result.exitCode !== 0 || result.errors)
        throw new Error(result.errors || "PHP execution failed");
      response.writeHead(result.httpStatusCode, result.headers);
      response.end(result.bytes);
    })
    .catch((error) => {
      console.error(error);
      if (!response.headersSent)
        response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("PHP WASM verification adapter failed");
    });
});
server.listen(port, "127.0.0.1");
process.once("SIGTERM", () => server.close(() => process.exit(0)));
