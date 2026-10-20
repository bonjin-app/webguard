import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
// A publish retry must still validate the downloaded bytes/latest tag, rather than
// treating matching version metadata as proof that the whole release completed.
it("verifies an already-published matching artifact and rejects a mismatched latest tag on retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "webguard-release-retry-"));
  try {
    for (const name of ["scripts", "packages/npm", ".npm-release", "bin"])
      await mkdir(join(root, name), { recursive: true });
    await copyFile(
      "scripts/release-npm.mjs",
      join(root, "scripts/release-npm.mjs"),
    );
    const bytes = Buffer.from("reviewed package bytes");
    const integrity =
      "sha512-" + createHash("sha512").update(bytes).digest("base64");
    const pkg = {
      name: "uulab-webguard",
      version: "0.1.0",
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org",
      },
    };
    await writeFile(
      join(root, "packages/npm/package.json"),
      JSON.stringify(pkg),
    );
    await writeFile(join(root, ".npm-release/uulab-webguard-0.1.0.tgz"), bytes);
    await writeFile(
      join(root, ".npm-release/release.json"),
      JSON.stringify({
        name: pkg.name,
        version: pkg.version,
        filename: "uulab-webguard-0.1.0.tgz",
        integrity,
      }),
    );
    // No real authentication/publishing is used. Only whoami is allowed in the subprocess.
    await writeFile(
      join(root, "bin/npm"),
      "#!/usr/bin/env node\nif(process.argv[2]!=='whoami')process.exit(91);console.log('release-test-user');\n",
    );
    await chmod(join(root, "bin/npm"), 0o755);
    const published = {
      maintainers: [{ name: "release-test-user" }],
      "dist-tags": { latest: "0.1.0" },
      versions: {
        "0.1.0": {
          name: pkg.name,
          version: pkg.version,
          dist: {
            integrity,
            tarball:
              "https://registry.npmjs.org/uulab-webguard/-/uulab-webguard-0.1.0.tgz",
          },
        },
      },
    };
    const registryFile = join(root, "registry.json");
    await writeFile(registryFile, JSON.stringify(published));
    const preload = join(root, "registry-fixture.mjs");
    await writeFile(
      preload,
      `import {readFile} from 'node:fs/promises';
const registry=${JSON.stringify(registryFile)}, tarball=${JSON.stringify(join(root, ".npm-release/uulab-webguard-0.1.0.tgz"))};
globalThis.fetch=async (url)=>{if(String(url)==='https://registry.npmjs.org/uulab-webguard')return new Response(await readFile(registry));if(String(url)==='https://registry.npmjs.org/uulab-webguard/-/uulab-webguard-0.1.0.tgz')return new Response(await readFile(tarball));throw Error('Unexpected external request '+url);};`,
    );
    const args = [
      "--import",
      preload,
      join(root, "scripts/release-npm.mjs"),
      "publish",
    ];
    const options = {
      cwd: root,
      env: { ...process.env, PATH: join(root, "bin") + ":" + process.env.PATH },
      timeout: 15000,
    };
    await execute(process.execPath, args, options);
    const evidenceFile = join(root, "docs/evidence/npm-release.json");
    expect(JSON.parse(await readFile(evidenceFile, "utf8"))).toMatchObject({
      name: "uulab-webguard",
      version: "0.1.0",
      integrity,
      downloadedTarballMatches: true,
      latest: "0.1.0",
    });
    published["dist-tags"].latest = "9.0.0";
    await writeFile(registryFile, JSON.stringify(published));
    await rm(evidenceFile);
    await expect(execute(process.execPath, args, options)).rejects.toThrow();
    await expect(readFile(evidenceFile)).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
