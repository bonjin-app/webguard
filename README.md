# WebGuard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

**JavaScript obfuscation, browser runtime guards, and deployment verification for web applications.**

Connect WebGuard to your build, deploy protected browser assets, and inspect the results in your own application. The website is a live demo of the SDK.

[Website](https://webguard.uulab.co.kr/) · [Interactive demo](https://webguard.uulab.co.kr/demo) · [API reference (Korean)](docs/API.ko.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

## What it does

- Obfuscates compiled browser JavaScript with configurable presets, including Strict/High string and control-flow transforms.
- Removes public source maps; generates final-byte SHA-384 manifests and, in static HTML integrations, SRI references.
- Starts optional browser guards automatically; supports live policy updates, page-delivered shortcut/context-menu restrictions, DOM change signals and execution-delay signals.
- Generates static deployment policies and checks deployed bytes, response headers and known private-file paths against a trusted local build.

**Browser-delivered code, HTML and network traffic remain observable. Obfuscation raises analysis cost; it is not encryption. A web SDK cannot reliably detect, disable or close browser-owned DevTools. Keep credentials, authorization and payment decisions on your server.**

## Choose an installation path

Build tools require **Node.js 22.12+**. The product is **WebGuard**; `uulab-webguard` is its npm identifier. Internal `@webguard/*` workspace packages are not public installation targets.

**Release status, checked 2026-10-22:** npm `latest` is **0.2.0**. The integrations below describe the **unpublished 0.3.0 candidate**. npm publication remains paused; do not expect these candidate APIs from `npm install uulab-webguard@latest`.

Copy the pinned npm or pnpm install command from [SDK/package downloads](https://webguard.uulab.co.kr/docs/#sdk-downloads) to install directly in your app without moving files or editing paths. npm publication remains paused. Keep the package URL and the selected manager’s lockfile together: use `npm ci` with package-lock.json or `pnpm install --frozen-lockfile` with pnpm-lock.yaml. pnpm 11 itself requires Node >=22.13; the SDK minimum remains 22.12. Downloading a reviewed `.tgz` and installing it locally remains an alternative.

Start with your environment: [Vite / React / Vue](docs/START_VITE.ko.md), [Next.js](docs/START_NEXT.ko.md), [Webpack / esbuild](docs/START_STATIC.ko.md), [HTML / jQuery](docs/START_HTML.ko.md), [Java / JSP](docs/START_JAVA.ko.md), [Python](docs/START_PYTHON.ko.md), [PHP](docs/START_PHP.ko.md), or [CDN SDK](docs/START_CDN.ko.md). These Korean quickstarts list the files to edit, commands and expected results separately.

```sh
npm install -D ./uulab-webguard-0.3.0.tgz
```

Review the candidate in a separate application before production. Dependencies still require network installation. The CDN SDK supplies runtime guards only; it does not obfuscate your application.

| Environment             | Integration                                                 | Example / scope                                                                                                                                |
| ----------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite 7/8, React + Vite  | `webguardApp()` in the existing config                      | [React](examples/react-vite/README.md), [TypeScript](examples/vanilla-ts/README.md), [JavaScript](examples/vanilla-js/README.md); browser apps |
| Next.js App Router      | `withWebGuard()` + Webpack production build                 | [Next SSR](examples/next-ssr/README.md); client chunks only                                                                                    |
| Webpack                 | Postprocess static output with `protect-app`                | [Webpack](examples/webpack/README.md); no native Webpack plugin                                                                                |
| esbuild                 | Same static-output postprocessing                           | [esbuild](examples/esbuild/README.md)                                                                                                          |
| Plain HTML / JavaScript | Protect static output or load the runtime SDK manually      | [Plain HTML](examples/plain-html/README.md)                                                                                                    |
| Java / JSP / Servlet    | Protected browser assets + SRI + server headers             | [Java 17 / Servlet 6 / Tomcat 10.1](examples/jsp-servlet/README.md)                                                                            |
| Python / PHP            | Protected browser assets + server-rendered tags and headers | [WSGI / PHP](examples/ssr-templates/README.md)                                                                                                 |
| ASP.NET / Nginx         | Protected assets + host-specific policy                     | [Server recipes](examples/server-templates/README.md); recipes, not executed-server verification                                               |

### Vite and React + Vite

Keep existing framework plugins such as `react()` and add WebGuard once:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";

export default defineConfig({
  plugins: [
    // Keep your existing plugins here.
    webguardApp({
      runtime: {
        devtools: { blockShortcuts: true, blockContextMenu: true },
      },
    }),
  ],
});
```

```sh
npm run build
npx --no-install webguard doctor dist
npx --no-install webguard-serve dist --port 4173
```

`webguard doctor dist --json` gives read-only local static-build diagnostics and next actions. It checks the manifest, final asset hashes and generated header policy; it does not verify browser behavior or deployed HTTP headers. Next `.next` output is excluded. [Install, update and recovery guide](docs/INSTALL.ko.md).

`webguardApp()` defaults to Strict/High, SDK startup, public source-map removal, SRI and generated policies. Development/HMR stays unchanged. Input restrictions are opt-in; this example explicitly enables them. Generated HTTP policies also apply to `vite preview`. Vite SSR, library and in-memory builds are outside this integration.

The default static policy restricts connections to the same origin and enforces Trusted Types where supported. Allow required APIs explicitly, for example `headers: { allowedOrigins: { connect: ["https://api.example.com"] } }`. Review existing script/style/CSP compatibility. `headers: false` disables automatic policy handling. [Policy guide (Korean)](docs/INSTALL.ko.md).

### Next.js App Router

```js
// next.config.mjs
import { withWebGuard } from "uulab-webguard/next";

const nextConfig = { reactStrictMode: true }; // Keep your existing config.
export default withWebGuard(nextConfig, {
  preset: "strict",
  runtime: {
    devtools: { blockShortcuts: true, blockContextMenu: true },
  },
});
```

Set the app's build script to `next build --webpack`, then run `npm run build` and `npm start` (`next start`). **Next 16 Turbopack is unsupported.** Only production browser chunks are transformed; SSR, RSC, API, Node/Edge server code and development are excluded. Direct `public/` scripts need separate asset protection.

The adapter preserves existing CSP and does **not** generate CSP, SRI or HTTP headers. Reconcile request-specific nonces and hydration with your application. Do not postprocess the whole `.next` directory. [Runnable SSR example and limitations](examples/next-ssr/README.md).

### Webpack, esbuild and plain static HTML

After your existing build creates `dist`, add this step to the pipeline:

```sh
npx --no-install webguard protect-app dist --output dist-protected --preset strict --trusted-types report-only
npx --no-install webguard-serve dist-protected --port 4173
```

Deploy **only `dist-protected`**. This initializes the SDK, transforms selected JavaScript, removes public source maps, adds static HTML SRI and emits policies. Vite is not required. Add `--restrict-shortcuts --restrict-context-menu` if desired. This example uses Trusted Types report-only for loader compatibility; it requires real HTTP headers and does not enforce Trusted Types.

The input is preserved and existing destinations are refused. Use a fresh output directory for another build. Generic postprocessing preserves filenames: original content hashes can become stale. Use versioned deployment paths or revalidation, and update service-worker precaches, external SRI and signatures against final protected bytes.

Static HTML classic/module inline scripts are transformed in place. Arbitrary runtime-generated code, inline event handlers and server-template insertions are not recursively obfuscated; externalize them and resolve CSP ownership. Do not pass server project roots to this command.

### Java / JSP, Python and PHP server rendering

Install the candidate in an asset-build project, then protect **browser assets**, not server source:

```js
// protect-assets.mjs — Node only
import { protectDirectory } from "uulab-webguard/build";

await protectDirectory("browser-assets", {
  output: "browser-assets-protected",
  config: { preset: "strict" },
});
```

```sh
node protect-assets.mjs
```

This lower-level API performs build protection only. Include the standalone SDK and external initialization file in the input, then connect final assets in SDK → initialization → app order. Read final SRI from the trusted private manifest. Apply server response headers and private-file restrictions separately; keep manifests, reports and server source outside the public root.

- **Java / JSP:** follow the [JSP include + Servlet Filter example](examples/jsp-servlet/README.md); Java 17+, Maven, Tomcat 10.1 / Jakarta Servlet 6.
- **Python:** follow the [WSGI example](examples/ssr-templates/README.md), adapting static routes and headers to your framework.
- **PHP:** follow the [PHP router example](examples/ssr-templates/README.md), adapting it to PHP-FPM / Apache.

Java, JSP, Python and PHP source is never input to the JavaScript obfuscator. Their templates' inline scripts are not automatically transformed. Server-rendered HTML/data remains visible. Framework-specific deployments need their own runtime verification; there are no native Nuxt/Angular SSR adapters.

### Direct SDK download or CDN

Choose **self-hosted files** or the **pinned CDN URL with matching SRI** from the [download page](https://webguard.uulab.co.kr/docs/#sdk-downloads). For a self-hosted SDK:

```html
<script src="/assets/webguard.global.js" defer></script>
<script src="/assets/webguard-init.js" defer></script>
<script src="/assets/app.js" defer></script>
```

```js
// /assets/webguard-init.js — external file
const guard = WebGuardSDK.WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
// Call guard.destroy() when this manually owned instance is no longer needed.
```

Loading the standalone file does not initialize it. For CDN use, allow its exact origin in CSP and update URL/SRI together. CDN loading does not add build obfuscation, SRI to your own assets, server headers or authorization. Do not initialize a second guard if build integration already started one.

## Change guards while the app runs

For Vite's automatically started instance, use the browser-safe client API after startup:

```ts
import { getWebGuard } from "uulab-webguard/client";

const guard = getWebGuard();
guard?.update({ devtools: { blockShortcuts: false, blockContextMenu: false } });
const currentPolicy = guard?.getOptions();
```

For generic integration use `WebGuardSDK.getAutoGuard()`; see [Next-specific browser exports](docs/API_INTEGRATIONS.ko.md) for Next. DOM integrity and execution-delay monitoring are optional advisory signals. Set DOM baselines after hydration and only for stable content. [Functions, options, events and errors (Korean)](docs/API.ko.md).

## Serve and verify your deployment

The included Node server applies generated static headers and private-path rules. On another server/CDN, implement those rules explicitly: HTML meta cannot supply HTTP-only controls such as `frame-ancestors`. Verify origins and framework compatibility before production.

```sh
npx --no-install webguard-check dist-protected --url https://YOUR-SITE.example/
```

Use `dist` for the Vite example. This compares deployed asset/entry bytes, actual response headers and known private-file/source-map paths against your trusted build; failures exit with code 1. It is not a full application vulnerability scan.

## Run and contribute from source

Install Node.js 22.13+ first. If pnpm is not available, install the pinned version with `npm install --global pnpm@11.10.0`; Corepack is another option in the [first-contribution guide](CONTRIBUTING.md#first-contribution). No npm publishing or hosting account is needed.

```sh
git clone https://github.com/bonjin-app/webguard.git
cd webguard
pnpm install --frozen-lockfile
pnpm demo
```

For this source workspace, use Node 22.13+ and pnpm 11.10.0; installed package consumers require Node 22.12+. Open `http://127.0.0.1:4173`. For verification:

```sh
pnpm verify
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

## Get help or contribute

[Report a bug or request a feature](https://github.com/bonjin-app/webguard/issues/new/choose) with a small sanitized reproduction, your exact package/commit and environment. Use [private security reporting](https://github.com/bonjin-app/webguard/security/advisories/new) for suspected vulnerabilities; follow the [security policy](SECURITY.md). Please do not submit credentials or proprietary application source. The [contribution guide](CONTRIBUTING.md) maps modules to focused checks and explains generated files and candidate releases.

[Candidate acceptance (Korean)](docs/PRODUCTION_READINESS.ko.md) · [Support, updates and rollback (English)](docs/SUPPORT.md)

[Technical guide](docs/TECHNICAL_GUIDE.en.md) · [Installation guide (Korean)](docs/INSTALL.ko.md) · [Environment guide (Korean)](docs/ENVIRONMENTS.ko.md) · [Architecture](ARCHITECTURE.md) · [Threat model](THREAT_MODEL.md) · [Security policy](SECURITY.md) · [Changelog](docs/CHANGELOG.md)

All four README editions cover the same installation paths. Detailed API/option references are currently in Korean. Original WebGuard code is [MIT licensed](LICENSE); dependencies retain their own licenses, including javascript-obfuscator (BSD-2-Clause). See [third-party notices](THIRD_PARTY_NOTICES.md).
