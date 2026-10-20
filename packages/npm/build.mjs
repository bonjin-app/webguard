import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { prepareNpmPackageMetadata } from "../../scripts/npm-metadata.mjs";
await rm(new URL("./dist/", import.meta.url), { recursive: true, force: true });
await prepareNpmPackageMetadata();
const status = await new Promise((resolve, reject) => {
  const child = spawn("tsup", [], { stdio: "inherit", shell: false });
  child.once("error", reject);
  child.once("close", resolve);
});
if (status !== 0) process.exitCode = typeof status === "number" ? status : 1;
