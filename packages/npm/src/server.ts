import type { Server } from "node:http";
import { createProtectedServer as create } from "../../vite-plugin/src/static-server.mjs";

/** Serve trusted build output with its generated HTTP policy and private-file filtering. */
export function createProtectedServer(directory: string): Promise<Server> {
  return create(directory);
}
