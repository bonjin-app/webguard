import type { Server } from "node:http";
export function createProtectedServer(directory: string): Promise<Server>;
