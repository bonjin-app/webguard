# WebGuard

[공개 함수·옵션·반환값·이벤트 API 명세](docs/API.ko.md) · [온라인 API 명세](https://webguard.uulab.co.kr/docs/API.ko.html)

Local, open-source build protection for browser applications. WebGuard raises the effort of analyzing JavaScript, keeps source maps out of public artifacts, verifies asset integrity, and offers optional developer-tool shortcut friction.

**[Try the public demo](https://webguard.uulab.co.kr/demo)** — no installation or account required. Try High obfuscation, live shortcut controls and protected React/JavaScript/TypeScript applications. [Deployment and verification](docs/PUBLIC_DEMO.md).

**Browser-delivered HTML, CSS, JavaScript and network traffic remain observable. Obfuscation is not encryption. F12 interception cannot disable browser menus, external debuggers or user-controlled JavaScript. Never ship credentials or rely on this SDK for authorization.**

## Install in your web application

The product and service name is **WebGuard**. `uulab-webguard` is the npm package identifier only; use WebGuard in user-facing branding. It bundles the internal workspaces, so consumers install only one protection package. [한국어 설치·적용 가이드](docs/INSTALL.ko.md).

**0.3.0 is an unpublished local candidate; the currently published npm version is 0.2.0.** The behavior below describes the candidate, not the published 0.2.0 package. Review it in a separate application using a reviewed local tarball, for example `npm install -D /absolute/path/to/uulab-webguard-0.3.0.tgz`. One candidate package supplies the plugin, SDK, deployment checker and Node protection server.

[Direct SDK/package downloads and pinned CDN setup](https://webguard.uulab.co.kr/docs/#sdk-downloads) are available separately from npm publication. The CDN SDK supplies runtime guards; obfuscating your application still requires the build integration. Pinned URLs include a content identifier and the CDN example includes SRI. [Distribution maintenance](docs/DISTRIBUTION.md).

```sh
# Review a supplied local candidate; replace this with its actual path.
npm install -D /absolute/path/to/uulab-webguard-0.3.0.tgz
```

```ts
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";
export default defineConfig({
  plugins: [
    webguardApp({
      runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
    }),
  ],
});
```

Keep existing plugins. `webguardApp()` defaults to Strict/High with reversible RC4 string encoding, automatic SDK startup, SRI and no public source maps. It also inserts an early HTML CSP meta policy: same-origin network access (`connect-src 'self'`) and Trusted Types enforcement in supported browsers apply even without host headers. Development/HMR stays unrestricted. Shortcut/context-menu restrictions remain opt-in. Browser-safe live controls use `uulab-webguard/client`.

```sh
npm run build && npx webguard-serve dist --port 4173
```

The Node server applies generated response headers and denies private build files. The Vite plugin also applies those protections automatically to `vite preview`, with no separate preview configuration. Use the Node API from server code only:

```js
import { createProtectedServer } from "uulab-webguard/server";
const server = await createProtectedServer("dist");
server.listen(4173, "127.0.0.1");
```

Static hosts/CDNs must still apply real HTTP headers and private-file rules. `frame-ancestors`, Trusted Types report-only and MIME response protection cannot be supplied by HTML meta. `_headers` handling depends on the host. Allow an external API with `headers.allowedOrigins.connect: ["https://api.example.com"]` using exact origins. `headers.trustedTypes` accepts `enforce` (default), `report-only` or `off`; report-only requires actual HTTP headers. `headers: false` opts out of automatic meta/header/preview policy handling. Unsupported Trusted Types must never be reported as protected.

| Layer              | Candidate behavior                                                               | Boundary                                                    |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Built HTML         | Early CSP meta restricts script/network use and enforces supported Trusted Types | No HTTP-only directives or private-file serving rules       |
| HTTP server        | Protection server/preview applies response headers and private-file restrictions | Static hosts must implement their own header and path rules |
| SDK                | Automatic startup; optional input restrictions and advisory signals              | F12/context-menu restrictions default off; no DevTools lock |
| Application server | Developer-owned price, input and authorization checks                            | Not an automatic SDK feature                                |

Unsupported Trusted Types is never verification success. Expected fixed-probe CSP/TypeError messages and HTTP 409 must be corroborated by before/after outcomes. Unexpected 404/5xx responses, baseline failures and unhandled application exceptions remain faults, even when their console messages are red.

After deployment, compare real responses with the trusted local build:

```sh
npx --no-install webguard-check dist --url https://YOUR-SITE.example/
```

This checks asset and entry HTML bytes, actual response headers, source-map absence and private deployment-control URLs. Failures produce JSON errors and exit code 1. The Node API is `checkDeployment(directory, baseUrl)` from `uulab-webguard/verify`. See the [release changes](docs/CHANGELOG.md).

## Run this repository

Requires Node **22.12+** and pnpm **11.10.0**.

```sh
pnpm install --frozen-lockfile
pnpm demo
```

Open `http://127.0.0.1:4173`. Start with three one-click High examples, try live F12/context-menu controls, open protected React/JavaScript/TypeScript apps and copy integration snippets. Documentation and examples use the same origin. [Demo walkthrough](docs/DEMO_GUIDE.md).

For verification: `pnpm verify`, `pnpm exec playwright install chromium firefox webkit`, then `pnpm test:e2e`. The test command prepares the complete demo before browser checks. `pnpm dev` starts only the standalone transformation UI.

The Playground transforms code locally in a worker; it does not upload it. Its isolated execution harness has no DOM or network access and terminates long-running workers. It compares console output, not arbitrary program semantics. It is a development demonstration, not a hardened multi-tenant code execution service.

`@webguard/*` remain **internal local workspace names**, not public distribution names. `@webguard/core` belongs to another registry publisher. The public facade is `uulab-webguard`; do not install an unrelated package expecting this implementation. The workspace examples below use their internal links.

## Protect an existing application without Vite

The candidate public package exposes a build-tool independent API. Build browser assets using your existing toolchain, then protect the static output:

```js
// protect.mjs — run in Node
import { protectAppDirectory } from "uulab-webguard/build";
await protectAppDirectory("dist", {
  output: "dist-protected",
  config: { preset: "strict" },
  runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
  headers: { trustedTypes: "report-only" },
});
```

```sh
npx --no-install webguard protect-app dist --output dist-protected --preset strict
npx --no-install webguard-serve dist-protected --port 4173
```

Generic postprocessing preserves toolchain filenames. A `[contenthash]` filename can describe pre-protection bytes: changing the obfuscation seed or engine version can change final bytes without changing the URL. Avoid long-lived `immutable` caching on reused asset URLs. Use versioned deployment paths or revalidation/`no-store`, unless your pipeline also updates final hash names, references and manifests.

Connect this after the existing build command and deploy only the protected output. This API and CLI do not require Vite. The wrapper injects an external SDK before application scripts, obfuscates selected JavaScript, removes public source maps, calculates final SRI/manifest records and emits policies. Shortcut/context restrictions default off. Existing destinations are refused, so preserve the previous build or use a new output directory. `runtime: false` / `--no-runtime` omits auto startup; `headers: false` / `--no-headers` omits automatic policies.

Webpack, esbuild and plain HTML have dedicated consumer fixtures. PHP/JSP/ASP.NET templates use protected static assets, an external SDK initialization file and server-applied response headers; server templates are never obfuscated. [한국어 환경별 가이드](docs/ENVIRONMENTS.ko.md) and [server recipes](examples/server-templates/README.md). Server recipes are not executed server verification.

Static HTML classic/module inline scripts are transformed in place, preserving script order and global bindings. Automatically owned CSP policies receive hashes of the final script bytes, before the manifest is generated. Inline event handlers and unsupported dynamic-code strings must be externalized; arbitrary runtime-generated programs and server-template insertions are not recursively transformed. Unsupported selected blocks fail with their virtual file location. Resolve existing CSP ownership explicitly; report-only Trusted Types does not permit inline execution. Update framework-owned hashes, precache lists and signatures against final protected bytes. Next.js App Router has a dedicated client-only Webpack adapter (`uulab-webguard/next`); use `next build --webpack` on Next 16. It preserves server/RSC/API code and existing CSP; nonce, SRI and HTTP header generation are not part of that adapter. Nuxt/Angular native SSR adapters are not provided.

The original `protectDirectory()` API is also available from `/build`, and `webguard protect` retains build-only behavior without automatic runtime/header integration.

### Internal workspace CLI

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

The public package integration uses one build configuration and includes the SDK. Install the reviewed candidate shown above; internal `@webguard/*` workspace packages are not required:

```ts
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";
export default defineConfig({
  plugins: [
    webguardApp({
      runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
    }),
  ],
});
```

`webguardApp()` defaults to Strict/High, automatically initializes the SDK before the HTML module app entry, inserts early CSP meta and emits `webguard-headers.json` plus `_headers` for your server. Its Vite preview hook applies generated HTTP headers and private-file restrictions automatically unless `headers: false`. The React example has live F12/context-menu toggles without a rebuild or reload. [One-setting setup, live controls and server integration](docs/ONE_STEP_SETUP.md).

For only build protection, keep `webguard({ preset: "standard" })`. The plugin is build-only. It transforms chunks before content-hashed filenames are finalized, sanitizes the final output, adds SRI to local script/style/modulepreload tags and emits a manifest. Development HMR remains available. Private Vite maps, when requested, go into a unique sibling `.webguard-private/` directory. Initial support is written browser application builds; library, SSR and in-memory builds fail explicitly.

SRI validates referenced resources when supported and correctly served. It does not automatically secure every dynamically fetched resource. Set CSP as a real server response header, for example:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

Adapt origins for your application. Test actual production behavior; this example intentionally excludes inline scripts and `unsafe-eval`. WebGuard does not silently weaken your CSP.

## Strong protection and injection policy

`webguardApp()` enables stronger control-flow/string transforms and reversible RC4 string encoding by default. Its early meta CSP enforces supported script/network/Trusted Types rules in built HTML; its generated HTTP policies also cover directives unavailable in meta. For standalone policy generation use `node packages/cli/dist/bin.js headers`, then apply those headers through your server/CDN. None of these policies locks the developer console. Trusted Types is not HTML sanitization, and server prices/authorization remain application server responsibilities. See [hardening and attack boundaries](docs/SECURITY_HARDENING.md).

## Browser SDK

```ts
import { WebGuard } from "uulab-webguard/browser";
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

Use `guard.update({ devtools: { blockShortcuts: true } })` for immediate changes and `guard.getOptions()` for a detached snapshot. Automatically injected instances are available from `getWebGuard()` in `uulab-webguard/client`.

The unpublished candidate bounds `checkIntegrity()` with `integrity.timeoutMs` (default 10,000ms), `maxBytes` (16 MiB of decoded bytes), and `maxConcurrent` (four per instance). Requests omit credentials/referrers and reject redirects and non-HTTP(S) URLs; cookie-authenticated files are not supported by this check. Overflow, deadlines and network failures are errors, not hash mismatches. Budget changes and teardown cancel pending work. Policy snapshots use null-prototype data objects; use `Object.hasOwn()` for property checks. See [request budgets and compatibility](docs/INSTALL.ko.md).

The unpublished candidate also supports an optional page interaction block:

```ts
guard.update({
  devtools: {
    detect: true,
    blockShortcuts: true,
    shortcutScope: "page",
    response: "block",
  },
});
```

This uses a native modal after an observed inspection shortcut or a docked-window size hint. Page scope includes editors while preserving ordinary typing, copy/paste and IME composition. The modal asks visitors to close DevTools and recheck; it cannot close DevTools, conceal the DOM, stop background execution or enforce authorization. Window sizing can produce false positives and miss undocked tools. Unsupported/failed modals emit `page-block-unavailable`, never `page-blocked`. Turning off the response or destroying the guard removes its UI. See the [Korean options guide](docs/INSTALL.ko.md) and [interactive demo](https://webguard.uulab.co.kr/demo#live-demo). npm publication remains paused.

All intrusive controls are opt-in, including Strict. Shortcut/geometry handling is event-driven; optional execution-lateness watching uses one visible-page timer deadline. There are no debugger traps, zero-delay loops, forced navigation or remote collection. Hints are advisory and not proof that developer tools are open. The public standalone IIFE is `uulab-webguard/browser.global.js`, global `WebGuardSDK.WebGuard`; loading it does not initialize a guard. Call `WebGuardSDK.WebGuard.init()` from an external initialization file. The generic wrapper emits `assets/webguard-runtime.js` and initializes one guard; retrieve it with `WebGuardSDK.getAutoGuard()` instead of initializing twice. The internal workspace IIFE remains `packages/browser/dist/webguard.global.js`.

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

Run `pnpm build` first. For maintainers, `pnpm test:consumers` packs the current public facade once into a temporary directory, then installs those same bytes in fresh Vite 7, Vite 8, Webpack/esbuild/plain HTML and Next projects, followed by runnable SSR template checks prepared from the workspace build (the SSR suite does not install the tarball). It saves per-suite receipts under `test-results/consumers/`, leaves the held `.npm-release` candidate unchanged, and does not publish. Run it after `pnpm build`; CI runs this separately from workspace tests. Missing PHP is explicitly recorded as skipped, not passed.

Playwright exercises Chromium, Firefox and WebKit desktop engines, not physical Chrome/Edge/Safari or mobile devices. Full compatibility is not claimed for untested browsers, versions or frameworks. Webpack/esbuild/plain HTML use the generic application-protection pipeline, with real consumer fixtures. Next.js App Router production Webpack integration has a dedicated packed-consumer SSR/hydration test. Nuxt and Angular native adapters are not provided. Python WSGI, PHP and JSP/Servlet have runnable server examples; distinguish native/WASM/HTTP/browser evidence in the SSR report. See the environment guide for the distinction between toolchain tests and unexecuted server recipes.

`pnpm benchmark` writes real fixture measurements to [Node benchmark evidence](docs/evidence/benchmark-node.json). Measurements are environment-dependent, not performance promises. [Demo verification](docs/DEMO_VERIFICATION.md) records the runnable hub checks. [Foundation verification](docs/VERIFICATION.md) separates automated tests, builds and external/device limitations.

See [architecture](ARCHITECTURE.md), [threat model](THREAT_MODEL.md), [security policy](SECURITY.md), [contributing](CONTRIBUTING.md) and [third-party licenses](THIRD_PARTY_NOTICES.md). Original WebGuard code is MIT licensed; javascript-obfuscator is BSD-2-Clause.

## Server rendering integrations

- [Next.js App Router](examples/next-ssr/README.md): `withWebGuard()` transforms only production browser chunks and starts the SDK. Existing server code, API routes and CSP stay under Next's control. Turbopack is unsupported; use `next build --webpack`.
- [JSP + Java Servlet](examples/jsp-servlet/README.md): protected external scripts, final-byte SRI in a private JSP include, server response headers and public-path allowlist.
- [Python WSGI / PHP](examples/ssr-templates/README.md): real per-request template rendering, isolated browser assets, SRI, server headers, live SDK controls and automated browser checks.

Java/Python/PHP source is never input to the JavaScript obfuscator. Inline scripts in server templates are not automatically transformed. See [한국어 적용 가이드](docs/ENVIRONMENTS.ko.md) and [runtime-specific verification](docs/SSR_VERIFICATION.md). All new APIs remain local candidates; npm publication is paused.

## Optional CSS identifiers and runtime signals

These unpublished candidate features default **off**:

- `webguardApp({ domIdentifiers: true })` and `withWebGuard(config, { domIdentifiers: true })` use opaque production **CSS Modules class names**. Next shares the mapping between SSR and browser compilers. This does not rewrite arbitrary HTML IDs, global CSS, form names or DOM structure. Supported PostCSS/Webpack CSS Modules pipelines are required; conflicting custom naming or Lightning CSS/Turbopack configurations are rejected. Manual CSS Modules pipelines can share `createDomIdentifierGenerator({ root: absoluteRoot })` from `uulab-webguard/build` across server and browser builds.
- `debugging: { enabled: true, watch: true, intervalMs: 1000, thresholdMs: 1500, response: "report" }` watches visible-page execution lateness automatically. One timer uses the full interval (default 1,000ms, range 250–60,000ms); hidden/pagehide cancels the deadline and visibility/pageshow starts a fresh one. Consecutive late callbacks deduplicate suspicion events until a normal sample or restart. `await guard.checkDebugging()` remains a separate explicit single-sample option, with at most one additional manual sample. CPU load and scheduling can cause the same signal as a pause; a debugger pause can only be reported after execution resumes. Merely opening DevTools may be unobservable. There are no debugger traps or zero-delay loops.
- `domIntegrity: { enabled: true, selectors: ["#static-notice"], response: "report" }` snapshots the first matching **static** anchor per selector, observes attributes/text/removal/replacement and reports metadata without raw DOM contents. Enable after mount/hydration, then call `guard.rebaselineDom()` only to accept trusted current content. Missing anchors and budget failures are errors. A mismatch/error stops observation until an explicit successful rebaseline. Dynamic forms/counters should not be selected.

Use the existing auto-started guard via `getWebGuard()` from `/client`, rather than initializing another instance. Runtime policies can also be supplied to manual initialization or build integration. A `block` response restricts interaction through a page notice; it cannot close DevTools, stop console/background execution or enforce server authorization. CSS names and selected DOM remain browser-visible. See [한국어 설정·SSR 수명주기·한도](docs/INSTALL.ko.md#9-선택-기능-css-식별자와-런타임-신호) and [interactive comparison](https://webguard.uulab.co.kr/demo#runtime-hardening). npm publication remains paused.

For automatic watching, pass that `debugging` object under `runtime` in `webguardApp()` or `withWebGuard(existingConfig, options)`; no manual check button is required. Read browser status using `getWebGuard()?.getDebuggingState()`: `state` is `off`, `manual`, `watching`, `suspended` or `unavailable`, with `samples`, `lastCheckedAt`, `lastDelayMs` and `lastSuspicionAt`. These are watch-only statistics, reset by relevant watch-policy changes, not a security verdict. `watch: false` retains explicit manual sampling while `enabled: false` disables both. Manual `false` results also cover cancelled/hidden/disabled samples. Our own public site explicitly enables automatic **report** mode; SDK consumer defaults remain off. See the Korean guide for complete Vite/Next configuration and live getter examples.
