import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

/** Generate package-local documentation/notices from repository sources. */
export async function prepareNpmPackageMetadata() {
  const source = new URL("../", import.meta.url);
  const target = new URL("../packages/npm/", import.meta.url);
  await mkdir(new URL("examples/", target), { recursive: true });
  await copyFile(new URL("LICENSE", source), new URL("LICENSE", target));
  await copyFile(
    new URL("docs/INSTALL.ko.md", source),
    new URL("INSTALL.ko.md", target),
  );
  await writeFile(
    new URL("examples/server.mjs", target),
    (
      await readFile(
        new URL("examples/security-server/server.mjs", source),
        "utf8",
      )
    ).replace(
      "../../packages/vite-plugin/src/static-server.mjs",
      "../dist/server.js",
    ),
  );
  const license = await readFile(
    new URL("docs/licenses/javascript-obfuscator.txt", source),
    "utf8",
  );
  await writeFile(
    new URL("THIRD_PARTY_NOTICES.md", target),
    `# Third-party notices\n\nWebGuard's original code is MIT licensed. The transformation engine javascript-obfuscator 5.9.0 is an external BSD-2-Clause dependency, Copyright (c) 2016-2026 Timofei Kachalov. Its full license text follows below. The engine runs during builds; protected browser applications do not require the transformation engine at runtime.\n\nOther runtime dependencies are Acorn (MIT), picomatch (MIT), and parse5 (MIT), plus their dependencies. Vite is an MIT-licensed peer dependency. Installed dependencies retain their own license files; preserve the applicable notices when redistributing them.\n\n## javascript-obfuscator — BSD-2-Clause\n\nCopyright (c) 2016-2026 Timofei Kachalov\n\n\`\`\`text\n${license.trim()}\n\`\`\`\n`,
  );
}
