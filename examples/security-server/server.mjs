import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createProtectedServer } from "../../packages/vite-plugin/src/static-server.mjs";
export { createProtectedServer };

if (
  process.argv[1] &&
  (await realpath(process.argv[1]).catch(() => undefined)) ===
    fileURLToPath(import.meta.url)
) {
  try {
    const [directory, ...args] = process.argv.slice(2);
    if (
      !directory ||
      (args.length && (args.length !== 2 || args[0] !== "--port"))
    )
      throw new Error(
        "Usage: node examples/security-server/server.mjs <dist> [--port 4174]",
      );
    const port = args.length ? Number(args[1]) : 4174;
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Port must be an integer from 1 to 65535");
    const server = await createProtectedServer(directory);
    await new Promise((resolveListening, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolveListening);
    });
    console.log(`Protected static example: http://127.0.0.1:${port}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
