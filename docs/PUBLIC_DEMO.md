# Public demo deployment

**[Open the public demo](https://webguard.uulab.co.kr/demo)**. No login or installation is required. React, JavaScript, TypeScript and documentation links run on the same HTTPS origin. The product root temporarily redirects to `/demo`; `/demo/` redirects to the canonical `/demo` path while preserving query parameters. The previous `workers.dev` addresses remain available.

The public adapter runs the same demo applications on Cloudflare Workers Static Assets. It does not execute submitted JavaScript on a server: transformation and bounded test execution remain in the visitor's browser.

## Expanded guards and protected Playground (current)

The complete tour now runs five policy/tampering scenarios plus the SDK and a real deployment-resource audit. New before/after probes compare a fixed JSON fetch against `connect-src` enforcement and a harmless `innerHTML` assignment against Trusted Types enforcement. Unsupported Trusted Types is explicitly excluded from successful checks; an interrupted or invalid control response never counts as protection. The fixed CORS fixture returns no request or user data and accepts no credentialed response sharing.

The Playground entry bundle itself now uses WebGuard's strict preset (High transforms and RC4 string encoding). Entry JS and CSS carry file-bound SHA-384 SRI, and public source maps remain disabled. Build-only reports and original/configuration files stay outside the exact public allowlist. Browser-delivered JS/CSS still remain inspectable. The visitor can fetch the actual private-path probes and compare entry bytes with the document SRI in the new **배포 리소스 검사** panel. This checks deployment observations, not authorization or authenticity of an attacker-controlled HTML document.

The stricter application build exposed an existing `function.toString()` bootstrap assumption: transformed code referenced outer string decoders that were absent in the isolated frame. A standalone raw bootstrap preserves the original sandbox, worker and message-channel boundaries while removing that closure dependency. Infinite-loop, blocked-network and forged-message regressions remain covered. Resource audits also retain their event listeners across persisted page lifecycle transitions, abort old work and prevent stale results from replacing a new run. Lifecycle tests simulate the browser events; they do not prove that a particular navigation was admitted to BFCache.

Current deployment: Worker version `799cd048-5712-45e6-bb14-bc61c3ac5b8c`, deployment `99b788e8-8bd5-4fa8-937c-9be36f8995f4`, 100% traffic. Implementation source commit: `1a24aa3`. Final verification passed 99 local browser checks and 104 public checks (99 browser + five HTTP), each across Chromium, Firefox and WebKit where applicable, plus 20 local API/routing tests. All 29 public files matched prepared SHA-256 values; root/Worker type checks, scoped lint, formatting and the deployment dry run passed. npm publication and Codex settings were unchanged. The following release sections are historical.

[Korean guard guide](DEMO_GUARDS.ko.md) · [Resource audit screenshot](evidence/resource-guards.png) · [Deployment and validation evidence](evidence/expanded-guards-deployment.json).

## Diagnostics and favicon fix (historical)

The missing `/favicon.ico` now serves a real 32px ICO; the head links both the matching SVG mark and the ICO fallback. Both images decode to 32×32 in Chromium, Firefox and WebKit and serve HTTP 200 with image content types.

The lab explains that its intentional CSP violation and rejected quote (HTTP 409) can appear as red browser-console entries. Each successful probe labels its expected diagnostic in its actual result; missing observations and server 500 responses remain failures. CSP enforcement, the server rejection and browser error reporting are preserved. No console clearing, global error suppression or fake successful response is introduced.

Verified Worker version `a1ec6f30-6dc8-4a6e-ae65-eb70a89b6918`, deployment `dcdaaa1a-a163-4928-85c1-3a15616d7f2d`, 100% traffic. Nine local browser tests and all 13 scoped public checks passed, including no unexpected startup console errors, no unhandled application exceptions during the whole tour, and a mocked server-failure distinction. All 29 deployed files matched local hashes. The full earlier feature matrices are historical evidence; this release reran the checks appropriate to the icon and diagnostic-only changes.

[Diagnostics fix evidence](evidence/demo-diagnostics-deployment.json) · [Expected-diagnostic explanation](evidence/demo-diagnostics.png).

## Complete feature tour

The first screen now exposes the real SDK, rather than placing its controls beneath the transformation tools. **전체 기능 체험 시작** enables shortcut/context-menu restrictions and explicit integrity checks, starts the SDK file verification and the three policy/tampering probes, and protects the current editor source using High. Existing editor content is preserved. A concurrent run is rejected with a visible message instead of relabeling an in-progress transform. Individual controls remain available; reloading returns to observation mode.

The live panel includes:

- Immediate on/off controls, individual shortcut/context-menu/dimension-detection/warning/integrity settings, a validated 40–1000 pixel heuristic threshold, and the actual `getOptions()` policy rendered as an update example.
- A focusable body target and an editable input. Browser keyboard/mouse tests observe trusted F12 and context-menu events, their real `defaultPrevented` state, and editable-field exceptions. Synthetic trials are separately labeled and do not establish DevTools-window prevention.
- Calls to the actual `checkIntegrity()` API against a manifest-listed protected JavaScript asset, followed by a one-character changed expected hash. Results require a real SDK mismatch event; a fetch error is not presented as a mismatch. Tests also replace actual response bytes to prove the display reacts to changed content. An explicit disabled policy performs no requests. A ten-second UI deadline disables integrity checking and aborts SDK requests instead of leaving a permanent busy control.
- A local event history capped at 20 entries, a clear button, no typed-input collection and no event upload. Dimension signals are labeled as uncertain and never converted into a claim that DevTools is open.

The document language is Korean. The install command now wraps on narrow Firefox viewports. The notice at the top explicitly distinguishes page input restrictions from Chrome-menu, existing-console and external-debugger control.

Verified deployment: Worker version `fd2c5843-c722-4577-8dbc-35b737d0f08d`, deployment `d371d152-99f8-4c6a-a1d0-f6e3f9defa6a`, 100% traffic. All 27 public files matched the local payload hashes. The final SDK browser set passed 21 checks; the two Firefox layout regressions passed after wrapping the command. The public matrix passed 69 of 70 checks, with a cached-read network-observer assumption failing once; the unchanged-response, cache-disabled observation fixture then passed on all three engines, completing verification of all 70 unique public checks. This is not a claim that the initial full matrix was clean. Earlier attempts and long wall-time stalls are retained in the evidence file. Main/Worker TypeScript, scoped ESLint, formatting and the deployment dry run passed.

This extends the lab release below; the earlier lab version and evidence remain historical. See [the complete-tour evidence](evidence/runtime-demo-deployment.json) and [the completed live panel](evidence/runtime-demo.png). npm packages and Codex settings are unchanged.

## Interactive lab release

The first screen now offers a one-click sequence and individual repeatable scenarios:

- Fixed inline script, `eval` and HTML event-handler probes run before/after CSP in separate opaque-origin, `allow-scripts` sandboxed frames. Success requires execution in the control plus nonexecution and a CSP violation (or the `eval` probe's actual `EvalError`) in the policy frame. Source, random token and message shape are checked; missing observations are not counted as success. The meta-policy fixture demonstrates browser policy, not DevTools prevention.
- SHA-384 compares a known original, a fixed changed file and editable input. This is a local hash demonstration, not an authenticity proof or live SRI enforcement.
- `/api/demo/quote` accepts same-origin JSON POST requests, recalculates the fixed course price on the server and returns HTTP 200 for 9,900 and HTTP 409 for a changed claim. The stateless sample does not create accounts, orders or payments and is not an SDK authorization feature. Origin checking is not authentication. Exact keys, integer/range constraints, a 1 KiB streaming body limit, a three-second read deadline and no-store responses bound the teaching endpoint.

The main demo remains available at [the canonical URL](https://webguard.uulab.co.kr/demo#security-lab). Existing obfuscation examples, protected apps and live shortcut controls remain available. A failed/network-interrupted scenario displays failure and remains retryable; no fabricated result is substituted.

Local API/routing checks (18 tests), main and Worker type checks, ESLint and a Wrangler dry run passed. The final local demo browser matrix passed all 45 tests across Chromium, Firefox and WebKit. The deployed HTTPS matrix passed all 49 checks (45 browser checks and four HTTP/integrity/API checks); an additional Chromium run captured the completed scenarios. The initial browser run found duplicate status-region selection and missing WebKit `eval` violation events (38 passed, four failed); the production UI and probe observations were corrected before the successful final run. Timeout and CSP settings were not relaxed to manufacture success.

Worker version `c2df10c1-c6bc-4267-a5d4-faf38984049e`, deployment `c2edbc87-f9ba-41df-a053-aeb94cb70f63`, serves 100% of traffic. The CLI authentication store was unavailable, so the existing connected Cloudflare account was used for the public asset upload and atomic Worker update; bindings, compatibility date, observability and hostname mappings were preserved. Temporary scoped asset-upload tokens were removed after use. Codex settings and npm publication were not changed.

[Interactive lab screenshot](evidence/security-lab.png) · [Release evidence](evidence/security-lab-deployment.json).

Use `pnpm demo` for the full local gateway including the API. The Vite-only `pnpm dev` preview serves the frontend; a missing API is displayed as a failed request, not successful protection.

## Branded-domain release (historical)

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

The Worker serves an explicit asset allowlist and the exact stateless `/api/demo/quote` teaching route. Static files support GET/HEAD; the teaching API supports POST. It handles trailing-slash mounts, policy-bearing errors and 404 responses without an SPA fallback. HTML handling in the asset binding is disabled so explicit `index.html` verification remains possible. Bodies are streamed from the asset binding.

## Policies and runtime

React/JS/TS retain their generated CSP/Trusted Types response policies. Playground/docs retain their separate minimal policy because their UI and isolated runner have different requirements. No developer-console lock or authorization boundary is inferred from those controls. Browser source input never becomes a server-side code-execution job.

Worker logs/traces are enabled with sampled collection and query-string redaction. Application code does not log submitted code or add browser telemetry. Worker-first routing is used to apply policies and reject nonpublic paths on every request; these requests are subject to the account's Worker request limits. Public hosting remains distinct from npm package publication.

## Validate a release

```sh
WEBGUARD_PUBLIC_URL=https://webguard.uulab.co.kr pnpm test:public
```

The public matrix checks real HTTP response policies, missing/nonpublic paths, deployed bytes against trusted local manifests, three-engine example navigation, one-click High transforms, live SDK controls and the existing isolated-runner regressions. It does not use local preview servers. Use separate `--output` directories when running multiple Playwright commands concurrently; shared output cleanup can remove another run's traces. Record the exact deployed version, local asset hashes and observed results in a release evidence file.

References: [static assets binding](https://developers.cloudflare.com/workers/static-assets/binding/), [worker-first routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [exact HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).
