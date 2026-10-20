import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { verifyDeployment } from "../../packages/cli/src/remote";
import { hashContent } from "@webguard/integrity";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
});
async function server(fallback = false) {
  const s = createServer((req, res) => {
    if (req.url === "/app/main.js") {
      res.end("globalThis.ok=true;");
      return;
    }
    if (fallback) {
      res.setHeader("content-type", "text/html");
      res.end("<html>SPA fallback</html>");
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const addr = s.address();
  if (!addr || typeof addr === "string") throw Error("Missing port");
  return `http://127.0.0.1:${addr.port}/app/`;
}
const manifest = {
  version: 1 as const,
  algorithm: "sha384" as const,
  files: {
    "main.js": { integrity: hashContent("globalThis.ok=true;"), size: 19 },
  },
};
it("compares deployed bytes and confirms source-map URL absence", async () => {
  const result = await verifyDeployment(await server(), manifest, ["main.ts"]);
  expect(result).toEqual({ valid: true, errors: [], checked: 3 });
});
it("does not mistake successful SPA fallback URLs for confirmed source-map absence", async () => {
  const result = await verifyDeployment(await server(true), manifest);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain(
    "Source URL responds successfully (review SPA fallbacks): main.js.map",
  );
});
it("reports byte changes against locally trusted hashes", async () => {
  const result = await verifyDeployment(await server(), {
    ...manifest,
    files: { "main.js": { integrity: hashContent("different"), size: 9 } },
  });
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Deployed hash mismatch: main.js");
});
