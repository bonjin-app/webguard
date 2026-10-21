import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const { stdout } = await promisify(execFile)("jar", [
  "tf",
  "examples/jsp-servlet/target/webguard.war",
]);
const publicFiles = stdout
  .split(/\r?\n/)
  .filter(
    (name) =>
      name &&
      !name.endsWith("/") &&
      !name.startsWith("WEB-INF/") &&
      !name.startsWith("META-INF/"),
  );
assert.deepEqual(publicFiles.sort(), [
  "assets/app.js",
  "assets/webguard.global.js",
  "index.jsp",
]);
assert.ok(!stdout.split(/\r?\n/).some((name) => name.endsWith(".map")));
console.log("WAR public files: exact protected-asset allowlist passed");
