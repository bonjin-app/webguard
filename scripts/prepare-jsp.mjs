import { mkdtemp, copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protectDirectory } from "../packages/cli/dist/index.js";
import { verifyManifest } from "../packages/integrity/dist/index.js";
import { readFile } from "node:fs/promises";
const tmp = await mkdtemp(join(tmpdir(), "webguard-jsp-"));
try {
  const input = join(tmp, "input"),
    output = join(tmp, "output");
  await mkdir(input);
  await copyFile(
    "packages/browser/dist/webguard.global.js",
    join(input, "webguard.global.js"),
  );
  await copyFile(
    "examples/jsp-servlet/assets-src/app.js",
    join(input, "app.js"),
  );
  await protectDirectory(input, {
    output,
    config: { obfuscation: { exclude: ["webguard.global.js"] } },
  });
  const verification = await verifyManifest(
    output,
    JSON.parse(await readFile(join(output, "webguard-manifest.json"), "utf8")),
  );
  if (!verification.valid) throw new Error(verification.errors.join("; "));
  const target = "examples/jsp-servlet/src/main/webapp/assets";
  await mkdir(target, { recursive: true });
  for (const file of await readdir(output))
    await copyFile(join(output, file), join(target, file));
  console.log(
    "Prepared and verified JSP static assets. Run Maven and test on Tomcat separately.",
  );
} finally {
  await rm(tmp, { recursive: true, force: true });
}
