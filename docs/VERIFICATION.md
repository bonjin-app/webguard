# Verification record

Work date: 2026-10-20, Asia/Seoul. This record applies to the local WebGuard implementation branch and checked artifacts, not to an external deployment or npm registry release.

## Evidence recorded

Final observed results: **88 unit/integration tests**, **30 browser tests**, **4 live Java/Tomcat HTTP tests**, zero failures. All 12 build tasks, strict type checking, ESLint and formatting passed. Final hashes and check summary are in [verification.json](evidence/verification.json).

- pnpm workspace: 7 reusable packages, 2 local apps, 3 Vite examples, plus a Maven JSP/Servlet example.
- Node 22.23.2; TypeScript 5.9.3 strict; ESM/declaration outputs plus browser IIFE.
- Unit/integration suites exercise real AST transforms, async/ESM/dynamic import, serialized properties, comments/string preservation, config validation, manifest/path rejection, original-input preservation and rollback.
- CLI subprocess tests invoke the built executable in an unrelated temporary application, including generated config, all six commands, existing-file refusal, failed builds and tamper exit status.
- Browser matrix: Chromium, Firefox and WebKit via Playwright 1.64.1. Each exercises protected Vanilla JS/TS and React, forms, state, hash navigation, lazy imports, opt-in shortcuts, strict CSP, docs and isolated Playground behavior.
- Real Java 17 / embedded Tomcat 10.1.61: four HTTP integration tests pass (JSP compilation/CSP, Servlet JSON/no-store, protected SDK/application scripts, 404 source/map URLs). Maven package produces a WAR without source maps, Java sources or test dependencies.
- Focused independent security review identified and checked regressions for inline/template/legacy-MIME maps, HTML/Vite public-base SRI, failed Vite rendering, classic scripts and private-map namespace collisions. These are covered by regression tests.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm format:check
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
pnpm benchmark
pnpm benchmark:browser
node scripts/prepare-jsp.mjs
mvn -B -f examples/jsp-servlet/pom.xml package
pnpm audit --prod
```

Maven was not preinstalled locally. The local run used temporary Apache Maven 3.9.11 with its archive SHA-512 checked against the Apache distribution checksum. Java integration tests bind only to loopback and clean up the container. The checked-in CI workflow provisions Java and repeats the WAR build; remote CI has not been run by this task.

## Measurements

[Node microbenchmark](evidence/benchmark-node.json) records source/output byte counts, transform time, ten isolated VM executions per preset and process RSS delta. [Chromium comparison](evidence/benchmark-browser.json) records three fresh-context samples per unprotected/protected React build: local loading time, transferred bytes, browser task CPU time, point-in-time JavaScript heap and lazy-load roundtrip. These are small host-specific measurements, not universal performance promises. The tiny Node fixture shows that obfuscation can substantially increase size.

[Playground screenshot](evidence/playground.png) is from the actual local production build. [Dependency license inventory](evidence/dependency-licenses.json) summarizes installed production dependency metadata with local filesystem paths removed. Runtime dependency audit returned zero known advisories at the time checked; this does not prove absence of vulnerabilities.

## Known limits and unverified surfaces

- No absolute source secrecy, developer-tool prohibition or client-side authority.
- Playground's upstream transformation engine adds approximately 1.65 MB worker code and produces a dependency-level direct-eval build warning. The browser SDK and protected application do not load that engine. Strict-CSP application behavior is tested separately.
- Playground compares bounded console output from scripts, not arbitrary DOM modules or universal semantic equivalence. Single-run timings are noisy. Browser worker isolation is not a hardened hostile-code service and does not bound every form of memory exhaustion.
- CSP response headers, CDN routing, historical maps and original filename aliases on a real deployment remain operator responsibilities. Deployment verification is opt-in and probes a bounded known URL set.
- Only the Vite browser application adapter and generic static-output CLI are implemented. Dedicated Webpack/Next/Nuxt/Angular adapters and advanced dashboards/remote event adapters are deferred.
- Browser automation is desktop-engine evidence. Physical Android/iOS devices, vendor-branded Chrome/Edge/Safari installations and independent production Tomcat deployments have not been tested.
- `@webguard/*` scope ownership is not established; `@webguard/core` already exists in npm. No npm publish, external deployment, push or PR occurred.
- Codex global configuration was not changed.
