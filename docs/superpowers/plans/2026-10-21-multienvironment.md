# Multi-environment integration plan

The original approved brief requires generic HTML/JavaScript/TypeScript, JSP and additional build-tool support, reusing the common engine. The user has now explicitly requested expanding beyond Vite. Implementation continues under that authorization; Codex configuration and npm publishing remain untouched/paused.

## Design

Keep Vite's existing integration. Expose the existing transactional protection pipeline through the public package independently of Vite. Add a generic application-protection wrapper that copies the input into a temporary tree, adds an external auto-start browser SDK, injects it into real static HTML before application scripts, emits deployment headers, then applies the existing protection/SRI/manifest pipeline. Input and existing destinations must remain untouched on all failures. Validate original input/output/private-map separation, symlinks, credentials and reserved file collisions before publication. Runtime settings and headers follow existing opt-in shortcut defaults and explicit compatibility choices.

Public interfaces:

- `uulab-webguard/build`: `protectAppDirectory(input, options)` plus existing `protectDirectory`, configuration helpers, manifest verification and types. Build imports must not require Vite at runtime.
- `webguard protect-app INPUT --output OUTPUT`: generic automatic SDK/build protection, default Strict. Preserve the existing generic CLI commands in the public package.
- `uulab-webguard/browser.global.js`: standalone classic-script SDK for templates and sites without a bundler. It must not start itself without explicit initialization; the generic app wrapper supplies the configured bootstrap.
- Vite is an optional peer. Non-Vite installed consumers must not pull Vite merely to use build/browser APIs.

Static HTML receives an external blocking SDK script before application scripts; transformation occurs before SRI generation. Existing CSP must be explicitly managed rather than silently overwritten. Strict policy must not silently break inline application code: fail with actionable guidance for unsupported inline scripts/handlers when injecting strict policy. Server templates are not passed through a JavaScript obfuscator. Template users protect static assets, load the emitted runtime with a script tag and apply server-side headers.

## Work and verification

1. Add generic application wrapper and security-focused integration tests, reusing the existing runtime option validator and filesystem pipeline.
2. Add public build/CLI/standalone exports and optional Vite peer; test packed-install isolation with no internal workspace resolution.
3. Supply runnable plain HTML, Webpack and esbuild consumers. Verify classic and ESM/dynamic-import outputs, early SDK initialization, default-off guards, enabled shortcut/context restrictions, removed source maps, final SRI and headers across Chromium/Firefox/WebKit. Preserve existing Vite tests.
4. Add Korean matrix separating tested toolchains, template integration recipes and unsupported SSR-specific automation. Provide JSP/PHP/ASP.NET and generic Nginx/Express header examples without claiming those servers were executed.
5. Update public documentation/demo integration guidance and deploy after regression checks. Do not publish npm. Retain old tarball bytes and provenance; pack new verification artifacts into a separate ignored directory.

Webpack/esbuild get real build/runtime evidence. Static-output workflows may also be usable from other tools but are not equivalent to verified Next.js/Nuxt SSR, middleware, hydration, nonces or framework manifest integration. Do not mutate server chunks, guess framework internals or claim untested framework adapters.
