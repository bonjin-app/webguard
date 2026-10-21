import { mkdtemp, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
    config: { preset: "strict" },
  });
  const verification = await verifyManifest(
    output,
    JSON.parse(await readFile(join(output, "webguard-manifest.json"), "utf8")),
  );
  if (!verification.valid) throw new Error(verification.errors.join("; "));
  const target = "examples/jsp-servlet/src/main/webapp/assets";
  await mkdir(target, { recursive: true });
  // Only executable browser assets belong under the public root. Keep the
  // verification manifest/report in staging and the SRI include under WEB-INF.
  const files = ["webguard.global.js", "app.js"];
  for (const file of ["webguard-manifest.json", "webguard-report.json"])
    await rm(join(target, file), { force: true });
  for (const file of files)
    await copyFile(join(output, file), join(target, file));
  const privateRoot = "examples/jsp-servlet/src/main/webapp/WEB-INF";
  await mkdir(privateRoot, { recursive: true });
  const tags = await Promise.all(
    files.map(async (file) => {
      const hash = createHash("sha384")
        .update(await readFile(join(output, file)))
        .digest("base64");
      return `<script src="assets/${file}" integrity="sha384-${hash}" crossorigin="anonymous" defer></script>`;
    }),
  );
  await writeFile(
    join(privateRoot, "webguard-assets.jspf"),
    tags.join("\n") + "\n",
  );
  console.log(
    "Prepared and verified JSP static assets. Run Maven and test on Tomcat separately.",
  );
} finally {
  await rm(tmp, { recursive: true, force: true });
}
