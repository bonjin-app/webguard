# WebGuard

Local, open-source build protection for browser applications. WebGuard raises the effort of analyzing JavaScript, keeps source maps out of public artifacts, verifies asset integrity, and offers optional developer-tool shortcut friction.

**[Try the public demo](https://webguard-demo.uulab.workers.dev)** — no installation or account required. Try High obfuscation, live shortcut controls and protected React/JavaScript/TypeScript applications. [Deployment and verification](docs/PUBLIC_DEMO.md).

**Browser-delivered HTML, CSS, JavaScript and network traffic remain observable. Obfuscation is not encryption. F12 interception cannot disable browser menus, external debuggers or user-controlled JavaScript. Never ship credentials or rely on this SDK for authorization.**

## Run this repository

Requires Node **22.12+** and pnpm **11.10.0**.

```sh
pnpm install --frozen-lockfile
pnpm demo
```

Open `http://127.0.0.1:4173`. Start with three one-click High examples, try live F12/context-menu controls, open protected React/JavaScript/TypeScript apps and copy integration snippets. Documentation and examples use the same origin. [Demo walkthrough](docs/DEMO_GUIDE.md).

For verification: `pnpm verify`, `pnpm exec playwright install chromium firefox webkit`, then `pnpm test:e2e`. The test command prepares the complete demo before browser checks. `pnpm dev` starts only the standalone transformation UI.

The Playground transforms code locally in a worker; it does not upload it. Its isolated execution harness has no DOM or network access and terminates long-running workers. It compares console output, not arbitrary program semantics. It is a development demonstration, not a hardened multi-tenant code execution service.

`@webguard/*` are **temporary local workspace names**. These packages have not been published. A registry check found `@webguard/core` already registered; namespace ownership and final names must be resolved before publication. Do not install an unrelated registry package expecting this implementation.

## Protect an existing application

Build your TypeScript/React/JSP assets using your existing toolchain, then run the local CLI from this checkout:

```sh
node packages/cli/dist/bin.js init
node packages/cli/dist/bin.js protect /path/to/app/dist --output /path/to/app/dist-protected
node packages/cli/dist/bin.js scan /path/to/app/dist-protected
node packages/cli/dist/bin.js verify /path/to/app/dist-protected
node packages/cli/dist/bin.js report /path/to/app/dist-protected
```

The CLI never overwrites the input or an existing destination. It rejects symbolic links, overlapping paths, uncompiled original source files (removes them from output), and potential credentials. Review heuristic scanner findings: no scanner proves that a bundle contains no secrets. Static HTML checks also report missing SRI and CSP that requires HTTP-header verification. Do not place application data, environment files or deployment credentials in your static build.

To run a trusted local build command first:

```sh
node packages/cli/dist/bin.js build --command 'pnpm exec vite build' --input dist --output dist-protected
```

Commands and TS/JS configuration files execute as trusted local code. Do not use untrusted configuration files. `protect`, `scan` and `verify` work entirely on local files unless deployment verification is explicitly requested.

```ts
// webguard.config.ts, in a consuming workspace linked to these packages
import { defineConfig } from "@webguard/core";
export default defineConfig({
  preset: "standard",
  obfuscation: {
    include: ["**/*.{js,mjs,cjs}"], // BUILT output paths, not src/**/*.tsx
    exclude: ["**/vendor/**"],
    reservedNames: ["^publicApi$"],
  },
  sourceMaps: { public: false, privateArtifacts: true },
  integrity: { enabled: true, generateManifest: true },
});
```

The CLI resolves its own `@webguard/core` helper when loading generated configuration, so `init` also works outside this checkout.

The default does not retain private maps. With `privateArtifacts: true`, original maps are archived under `OUTPUT.private-maps/input-maps/`, and transform maps under `OUTPUT.private-maps/generated-maps/`. Use `--private-artifacts-dir` for another directory outside every public deployment root. Keep private artifacts in access-controlled storage and upload **only** the protected public directory. The tool validates separation from its own input/output, but cannot know your web server's document root or CDN rules.

Generated files:

- `webguard-manifest.json`: SHA-384 SRI values and byte sizes for public assets.
- `webguard-report.json`: paths, transformations, byte counts, heuristic findings and limitations; no matched credential values.

Root manifest/report files are excluded from the manifest to avoid self-reference. Root `_headers` and `webguard-headers.json` deployment controls are also excluded because servers/hosts consume them rather than expose them as application resources. Protect these policies through the deployment pipeline. Nested files with these names remain hashed. A locally trusted manifest detects accidental or unauthorized asset changes, missing and unexpected files. An attacker who can replace both assets and the manifest can bypass an unanchored client check; protect the deployment pipeline and manifest separately.

## Vite

The opt-in all-in-one integration uses one build configuration and supplies the SDK transitively:

```ts
import { defineConfig } from "vite";
import { webguardApp } from "@webguard/vite-plugin";
export default defineConfig({
  plugins: [
    webguardApp({
      runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
    }),
  ],
});
```

`webguardApp()` defaults to Strict/High, automatically initializes the SDK before the HTML module app entry, and emits `webguard-headers.json` plus `_headers` for your server. The React example has live F12/context-menu toggles without a rebuild or reload. [One-setting setup, live controls and server integration](docs/ONE_STEP_SETUP.md).

For only build protection, keep `webguard({ preset: "standard" })`. The plugin is build-only. It transforms chunks before content-hashed filenames are finalized, sanitizes the final output, adds SRI to local script/style/modulepreload tags and emits a manifest. Development HMR remains available. Private Vite maps, when requested, go into a unique sibling `.webguard-private/` directory. Initial support is written browser application builds; library, SSR and in-memory builds fail explicitly.

SRI validates referenced resources when supported and correctly served. It does not automatically secure every dynamically fetched resource. Set CSP as a real server response header, for example:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

Adapt origins for your application. Test actual production behavior; this example intentionally excludes inline scripts and `unsafe-eval`. WebGuard does not silently weaken your CSP.

## Strong protection and injection policy

Use `webguard({ preset: 'strict' })` for stronger control-flow/string transforms and default reversible RC4 string encoding. Generate CSP/Trusted Types response headers with `node packages/cli/dist/bin.js headers`. These must be applied by your server/CDN and do not lock the developer console. See [hardening and attack boundaries](docs/SECURITY_HARDENING.md).

## Browser SDK

```ts
import { WebGuard } from "@webguard/browser";
const guard = WebGuard.init({
  devtools: {
    detect: true, // coarse window-size heuristic; may have false positives/negatives
    blockShortcuts: false,
    blockContextMenu: false,
    response: "monitor",
  },
  integrity: { enabled: true },
  onThreat(event) {
    console.warn(event.type);
  },
});
// Only an explicit call fetches a resource. Supply a trusted expected digest.
await guard.checkIntegrity("/assets/app.js", "sha384-BASE64_DIGEST");
guard.destroy(); // removes listeners; safe to call repeatedly
```

Use `guard.update({ devtools: { blockShortcuts: true } })` for immediate changes and `guard.getOptions()` for a detached snapshot. Automatically injected instances are available from `getWebGuard()` in `@webguard/vite-plugin/client`.

All intrusive controls are opt-in, including Strict. Detection is event-driven; there is no continuous polling, debugger loop, forced navigation or remote collection. Hints are advisory and not proof that developer tools are open. The standalone IIFE is `packages/browser/dist/webguard.global.js`, global `WebGuardSDK.WebGuard`.

## Policies

| Preset   | Build behavior                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| Basic    | Compact code and local identifier renaming; no integrity manifest by default                                 |
| Standard | Safe AST obfuscation and string-array transformation; integrity enabled                                      |
| Strict   | Stronger control-flow and string transforms + RC4 encoding; integrity enabled; browser blocking still opt-in |
| Custom   | Standard defaults with individually configured fields                                                        |

`obfuscation.level` is `basic`, `standard`, or `high`. Public property renaming and dead-code injection are off by default. Strict/High defaults to RC4; optional Base64/RC4 string encoding is reversible and is not secret storage. Module specifiers and bundler placeholders stay readable so loading remains correct. Required license/preservation/copyright comments are retained; ordinary comments are removed. Renaming requires explicit reserved public-property patterns; it can break reflection and serialization even when a transform is syntactically valid. Test your actual application. Excluded JavaScript still has mapping comments removed; `.map` and original TS/TSX/JSX/Vue/Svelte files are never copied into public output.

## Deployment verification

```sh
node packages/cli/dist/bin.js verify dist-protected --base-url https://example.com/app/
```

This explicitly fetches deployment resources and compares them to your **local** manifest, then probes known map and removed-source URLs. A 404/410 confirms absence for each checked URL at that time. Successful SPA fallback responses are reported for review; the tool does not claim these prove source disclosure or universal absence. Old deployments, CDN aliases, backups and unlisted original filenames require separate server configuration and audit.

## Examples and verification

| Example            | Local production preview                                         |
| ------------------ | ---------------------------------------------------------------- |
| Vanilla JavaScript | `pnpm --filter @webguard/example-vanilla-js preview --port 4176` |
| Vanilla TypeScript | `pnpm --filter @webguard/example-vanilla-ts preview --port 4177` |
| React + Vite       | `pnpm --filter @webguard/example-react-vite preview --port 4174` |
| JSP + Servlet      | See [JSP setup](examples/jsp-servlet/README.md)                  |
| Documentation      | `pnpm --filter @webguard/docs preview --port 4175`               |

Run `pnpm build` first. Playwright exercises Chromium, Firefox and WebKit desktop engines, not physical Chrome/Edge/Safari or mobile devices. Full compatibility is not claimed for untested browsers, versions or frameworks. Next.js, Webpack, Nuxt and Angular adapters are future work; use the generic static-output CLI where appropriate.

`pnpm benchmark` writes real fixture measurements to [Node benchmark evidence](docs/evidence/benchmark-node.json). Measurements are environment-dependent, not performance promises. [Demo verification](docs/DEMO_VERIFICATION.md) records the runnable hub checks. [Foundation verification](docs/VERIFICATION.md) separates automated tests, builds and external/device limitations.

See [architecture](ARCHITECTURE.md), [threat model](THREAT_MODEL.md), [security policy](SECURITY.md), [contributing](CONTRIBUTING.md) and [third-party licenses](THIRD_PARTY_NOTICES.md). Original WebGuard code is MIT licensed; javascript-obfuscator is BSD-2-Clause.
