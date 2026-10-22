# Support, rollout and rollback

WebGuard 0.3.0 is an unpublished candidate. npm publication remains paused. No stable support window, response-time SLA or universal browser/framework compatibility is declared. [Candidate acceptance criteria (Korean)](PRODUCTION_READINESS.ko.md) distinguish automated evidence, application pilots and stable approval.

## Candidate integration scope

| Integration                    | Requirement / contract                                                              | Reference verification                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Build tools                    | Node >=22.12; repository pnpm 11.10.0                                               | CI requires both Node 22.12.0 and current 22.x; inspect the matching receipts |
| Vite browser apps              | Vite >=7 <9; preserve existing plugins                                              | Installed Vite 7.3.1 and 8.3.4 fixtures                                       |
| React + Vite                   | Compiled browser application                                                        | React fixture, state/forms/lazy imports; not every third-party component      |
| Next App Router                | Production Webpack; explicit `next build --webpack`                                 | Installed Next 16.4.2 / React 19.3.1 fixture, SSR/hydration/navigation/API    |
| Webpack / esbuild / plain HTML | Postprocess compiled static assets                                                  | Installed static-output fixtures; no native Webpack adapter                   |
| Java / JSP                     | External browser assets, server policies; Java 17 / Jakarta Servlet 6 / Tomcat 10.1 | Embedded Tomcat and optional native desktop-engine checks                     |
| Python / PHP                   | External browser assets, server-rendered tags and headers                           | WSGI / PHP interpreter fixtures; not Django/Laravel/FPM certification         |
| ASP.NET / Nginx                | Explicit static asset and policy integration                                        | Recipes; server execution is not certified by those recipes                   |

Playwright Chromium/Firefox/WebKit evidence describes those automated desktop engines. It is not physical Chrome/Edge/Safari/mobile certification. Nuxt/Angular native SSR adapters and Next Turbopack are not supported. Java/JSP/Python/PHP server source is not JavaScript obfuscation input. Exact fixtures and their versions are evidence boundaries, not claims about all intervening or future versions.

The pinned Playwright 1.64.1 manifest selects Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2. These identify the automated reference engines, not minimum supported versions or physical Safari certification. Do not infer support for earlier browser versions from successful compilation. Physical-browser smoke receipts identify the actual installed browser/OS and the limited flows exercised separately.

Required consumer CI provisions native Python/PHP and runs `pnpm test:consumers --require-native-runtimes`. An unavailable interpreter fails acceptance before preparing SSR fixtures or launching browsers. Optional local verification can report `passed-with-skips`, including at the aggregate level; that is incomplete production acceptance. A WASM interpreter cannot satisfy the native-runtime gate.

The repository's pinned pnpm 11 requires Node >=22.13. CI builds the workspace on current Node 22.x, then switches to the actual consumer runtime and runs `node scripts/verify-installations.mjs --require-native-runtimes` using Node/npm, including the 22.12.0 floor. Receipts record the executing Node version. This is package-consumer floor verification; it does not claim pnpm 11 can bootstrap the repository on Node 22.12.0.

## Multiple scripts and reproducibility

Generated decoder helpers receive automatic namespaces so loading a second separately transformed classic script does not overwrite helpers used by delayed calls into the first. Application globals are preserved. Nonzero fixed seeds use a deterministic namespace derived from source, normalized settings and input filename; seed zero uses an independent namespace per transformation. Internal engine callers overriding `identifiersPrefix` own uniqueness. The namespace fingerprint is not an integrity/authenticity primitive.

Regenerate final SRI, manifests, external signatures and cache/precache identities after protection. A fixed seed preserves repeatability for identical inputs/options, not identical bytes across different SDK/compiler versions. Preserve a complete versioned deployment for rollback.

## Candidate updates

1. Select and retain the reviewed package/archive, commit and hashes. Keep the current working deployment and its matching HTTP policies available for rollback.
2. Read the [changelog](CHANGELOG.md) and test the new candidate in a separate app/staging deployment. Candidate changes may require integration adjustments; do not silently replace a version behind an existing pinned CDN URL.
3. Compare login/payment/forms/navigation/hydration/lazy loading under the app's real CSP. Use report-only rollout for optional monitoring before enabling interaction blocking. Changing Trusted Types to report-only does not permit inline execution or sanitize HTML; report-only needs an actual HTTP header.
4. Test production response headers, CSP origins, final SRI, caching and private-path restrictions on the actual host. The Next adapter preserves existing CSP and does not generate nonce/SRI/header policies.
5. Review payload and runtime costs on target devices. Obfuscation size/CPU tradeoffs vary by application. Exclusions, public property names, serialization and externally signed manifests require deliberate review.
6. Promote only the exact reviewed bytes. Log the approved environment, known exclusions and recovery procedure. npm publishing is a separate explicit release decision.

## Emergency runtime recovery

For a Vite auto-started instance, a browser-owned recovery control may disable intrusive/advisory runtime features without rebuilding:

```ts
import { getWebGuard } from "uulab-webguard/client";

getWebGuard()?.update({
  devtools: {
    detect: false,
    blockShortcuts: false,
    blockContextMenu: false,
    response: "monitor",
  },
  debugging: { enabled: false },
  domIntegrity: { enabled: false },
  integrity: { enabled: false },
});
```

For generic integration use `WebGuardSDK.getAutoGuard()`. For manual initialization, retain the instance returned by `WebGuard.init()`. An owner can call `destroy()` to remove the instance's listeners, pending work and UI. Reinstall only when the app is ready; avoid registering a new instance from startup callbacks. Recovery UI and runtime options are not authorization controls.

This does **not** undo obfuscation, previously applied SRI or browser/server CSP/Trusted Types policies. An HTTP policy already delivered to the document cannot be removed by updating the SDK. A script failure caused by CSP may also prevent an in-page recovery control from running.

## Full deployment rollback

Restore the previous reviewed **asset set and matching host policies together**. Retain its versioned asset URLs, SRI, HTML and caching contract; purge/revalidate mutable entry URLs as appropriate for the host. Revisit with a fresh document and verify the actual response bytes and headers. Updating only JavaScript or only CSP can leave incompatible content or security policy behind.

For future Vite builds, `runtime: false` omits automatic SDK startup while retaining build protection; `headers: false` disables automatic plugin policy handling. Neither option deletes headers already configured on a server/CDN. Reconcile host configuration explicitly and verify the result. Never restore public source maps, server files, credentials or old unprotected backup assets as an emergency workaround.

Generic postprocessing preserves filenames. Reused URLs must not retain stale `immutable` cache entries: use versioned deployment paths or revalidation. Update service-worker precaches, external SRI and signatures against final protected bytes. [Distribution retention](DISTRIBUTION.md).

## Reporting and stable promotion

Use [SECURITY.md](../SECURITY.md) for private security reports; avoid public credentials or exploit details. For ordinary compatibility bugs, provide a sanitized reproduction, source/package hash, runtime/framework/browser versions, policy and before/after behavior. Do not submit proprietary application code or user data.

Stable promotion requires the evidence and owner approvals in the candidate checklist, including an actual-application pilot, physical-device checks, independent security review and a declared support/update policy. Passing CI alone does not grant stable status or promise absolute source secrecy or DevTools prohibition.
