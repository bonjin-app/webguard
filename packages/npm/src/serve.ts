#!/usr/bin/env node
import { createProtectedServer } from "./server.js";

const usage = "Usage: webguard-serve <dist> [--port 4173]";
const [directory, ...args] = process.argv.slice(2);
if (directory === "--help" || directory === "-h") {
  console.log(usage);
} else {
  try {
    if (
      !directory ||
      directory.startsWith("-") ||
      (args.length && (args.length !== 2 || args[0] !== "--port"))
    )
      throw new Error(usage);
    const port = args.length ? Number(args[1]) : 4173;
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Port must be an integer from 1 to 65535");
    const server = await createProtectedServer(directory);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    console.log(`WebGuard protected build: http://127.0.0.1:${port}`);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Unable to start protected build",
    );
    process.exitCode = 1;
  }
}
