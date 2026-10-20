# Public demo deployment

**[Open the public demo](https://webguard.uulab.co.kr/demo)**. No login or installation is required. React, JavaScript, TypeScript and documentation links run on the same HTTPS origin. The product root temporarily redirects to `/demo`; `/demo/` redirects to the canonical `/demo` path while preserving query parameters. The previous `workers.dev` addresses remain available.

The public adapter runs the same demo applications on Cloudflare Workers Static Assets. It does not execute submitted JavaScript on a server: transformation and bounded test execution remain in the visitor's browser.

## Verified release

Verified on 2026-10-20 (Asia/Seoul): Worker version `dcd29343-80af-46cf-9f3b-f1485a509ef9`, deployment `57c83a0b-21ac-48b3-a756-9bb03c7c228c`, serving 100% of traffic with the `webguard.uulab.co.kr` Custom Domain and the existing Workers subdomain enabled.

- All 36 unique public checks passed across the initial run and isolated Firefox rerun: three HTTP/integrity checks and 33 browser checks across Chromium, Firefox and WebKit. No localhost preview server is used by this matrix. The old hostname also passed all three HTTP checks.
- All 27 publicly deployed files matched prepared local SHA-256 values on both hostnames. All five application mounts returned their intended response policies. Source maps, configuration, reports and original source probes returned 404.
- Local validation passed: all 13 build tasks plus mounted demo builds, root/Worker TypeScript, ESLint, formatting and eight focused routing/preparation tests. Existing CLI workflow timeouts were checked separately with a longer workflow budget while retaining each command's 30-second limit. The evidence records the initial failures and reruns.
- The deployment checker verifies real entry HTML, assets, generated response headers and nonpublic URLs against trusted local output. Fresh npm registry installations of 0.2.0 passed with Vite 7.3.1 and 8.3.4, including the installed executable.
- Vanilla example controls stay disabled until initialization completes. Browser regressions deliberately delay the script response and verify the first enabled click works. Preparation also rejects overlapping and symlinked output paths before creating directories.

[Deployment metadata, hashes and HTTP readback](evidence/branded-domain-deployment.json) · [Public screenshot](evidence/branded-demo.png). These are public HTTPS and local desktop-engine observations; npm publication is separately verified in [the release evidence](evidence/npm-release-0.2.0.json); remote CI and physical-device testing remain separate.

The public onboarding now includes `npm install --save-dev uulab-webguard@0.2.0`, copyable one-setting Vite integration, `webguard-check` and the [full Korean guide](https://webguard.uulab.co.kr/docs/INSTALL.ko.txt). The [0.2.0 Workers-subdomain release](evidence/quality-0.2.0-deployment.json), [0.1.0 onboarding release](evidence/npm-onboarding-deployment.json) and [original public release](evidence/public-deployment.json) are retained as historical records.

## Build and deploy

```sh
pnpm install --frozen-lockfile
pnpm deploy:build
pnpm deploy:dry-run
pnpm exec wrangler whoami
pnpm exec wrangler deploy
```

Wrangler is pinned in this workspace. `wrangler.jsonc` targets a dedicated `webguard-demo` Worker and its `webguard.uulab.co.kr` Custom Domain on the intended UULab account. The hostname had no existing DNS record or Worker binding before attachment. Other operators must select their own account, Worker and hostname before deployment. Credentials use Wrangler's local authentication store and are not in repository files or uploaded assets.

`deploy:build` assembles the full demo, prepares sanitized public assets and a private routing manifest, generates binding/runtime types and checks the Worker contract. Source maps, deployment controls, local-path reports, original sources, server files and dotfiles are excluded from the public upload. The three protected application manifests are checked against local files before preparation. Policy JSON is bundled into the Worker rather than publicly served.

The Worker serves an explicit asset allowlist. It handles trailing-slash mounts, GET/HEAD, policy-bearing errors and 404 responses without an SPA fallback. HTML handling in the asset binding is disabled so explicit `index.html` verification remains possible. Bodies are streamed from the asset binding.

## Policies and runtime

React/JS/TS retain their generated CSP/Trusted Types response policies. Playground/docs retain their separate minimal policy because their UI and isolated runner have different requirements. No developer-console lock or authorization boundary is inferred from those controls. Browser source input never becomes a server-side code-execution job.

Worker logs/traces are enabled with sampled collection and query-string redaction. Application code does not log submitted code or add browser telemetry. Worker-first routing is used to apply policies and reject nonpublic paths on every request; these requests are subject to the account's Worker request limits. Public hosting remains distinct from npm package publication.

## Validate a release

```sh
WEBGUARD_PUBLIC_URL=https://webguard.uulab.co.kr pnpm test:public
```

The public matrix checks real HTTP response policies, missing/nonpublic paths, deployed bytes against trusted local manifests, three-engine example navigation, one-click High transforms, live SDK controls and the existing isolated-runner regressions. It does not use local preview servers. Use separate `--output` directories when running multiple Playwright commands concurrently; shared output cleanup can remove another run's traces. Record the exact deployed version, local asset hashes and observed results in a release evidence file.

References: [static assets binding](https://developers.cloudflare.com/workers/static-assets/binding/), [worker-first routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [exact HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).
