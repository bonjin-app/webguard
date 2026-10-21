import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { prepareNpmPackageMetadata } from "./npm-metadata.mjs";
const descriptions = {
  shared: "Shared threat-event types.",
  core: "Typed configuration, validation and policy presets.",
  obfuscator: "AST-based protection of already-built JavaScript.",
  integrity: "Local SHA-384 manifests and file verification.",
  browser: "Optional browser shortcut friction and advisory callbacks.",
  cli: "Transactional static-output protection and deployment verification.",
  "vite-plugin":
    "Vite protection: webguardApp() combines Strict transforms, automatic SDK startup and deployment header files. Browser-safe live controls: getWebGuard() from @webguard/vite-plugin/client.",
};
for (const [name, description] of Object.entries(descriptions)) {
  const dir = `packages/${name}`;
  await copyFile("LICENSE", `${dir}/LICENSE`);
  await copyFile("THIRD_PARTY_NOTICES.md", `${dir}/THIRD_PARTY_NOTICES.md`);
  await writeFile(
    `${dir}/README.md`,
    `# @webguard/${name}\n\n${description}\n\nTemporary local workspace package, not published. See the repository README for setup and examples. Obfuscation cannot hide browser-delivered code or replace server authorization.\n\nSource: https://github.com/bonjin-app/webguard\n`,
  );
  const path = `${dir}/package.json`,
    pkg = JSON.parse(await readFile(path, "utf8"));
  pkg.files = ["dist", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"];
  pkg.repository = {
    type: "git",
    url: "https://github.com/bonjin-app/webguard.git",
    directory: dir,
  };
  await writeFile(path, JSON.stringify(pkg, null, 2) + "\n");
}
console.log(
  "Prepared local package documentation and license notices; nothing published.",
);
// The public facade is independently packed; internal workspace names stay private to this repo.
await prepareNpmPackageMetadata();
await mkdir("apps/docs/public", { recursive: true });
await copyFile("docs/INSTALL.ko.md", "apps/docs/public/INSTALL.ko.txt");
await copyFile(
  "docs/ENVIRONMENTS.ko.md",
  "apps/docs/public/ENVIRONMENTS.ko.txt",
);
