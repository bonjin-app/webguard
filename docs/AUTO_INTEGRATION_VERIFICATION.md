# Automatic SDK integration verification

Local verification on 2026-10-20 (Asia/Seoul), based on `c8f2748`. The change adds opt-in `webguardApp()` with Strict defaults, automatic SDK startup, live policy updates and deployment header artifacts. Global Codex configuration remains unchanged.

## Results

- All 12 workspace build tasks passed. TypeScript, ESLint and formatting passed.
- **147 unit/integration tests passed**, zero failures. New behavior includes automatic SDK startup before the module app entry, real Vite output execution without manual SDK initialization, development opt-out, atomic live updates, listener cleanup, SSR isolation, header file conflicts and a live HTTP example.
- **39 browser tests passed** across Chromium, Firefox and WebKit, zero failures/skips. The React example uses only the automatic bootstrap plus the client control entry. Each engine delivered a trusted F12 key event that the SDK canceled, and live controls disabled/re-enabled interception without a reload. This is page-event evidence; browser menus, already-open tools and remote debugging remain outside that control.
- The React example now receives generated CSP/Trusted Types from the real Node HTTP example. Its browser test no longer emulates those application headers. Separate injection fixtures continue to test explicit CSP/Trusted Types attack cases.
- **4 Java 17/Tomcat 10.1.61 HTTP tests passed**, and Maven produced a WAR after regenerating its SDK/application assets.
- All four final example manifests matched local files. Actual local Node HTTP deployment verification passed 8 resource/source-probe checks with generated response headers: [readback](evidence/auto-integration-readback.json).
- The [packed consumer check](../scripts/verify-package-consumer.mjs) installed tarballs into an unrelated temporary app with only the plugin as its direct protection dependency. Its build, automatic SDK, browser-safe client subpath, initial shortcut interception and headers passed. [Consumer evidence](evidence/package-consumer.json). Internal package names were pinned to local tarballs because no registry packages have been published; this does not prove a registry installation/release.

A focused independent read-only review found three integration defects: retained output policies could be overwritten, ordinary host plugin header assets were checked too early, and a null preset was treated as omitted. Regression tests first failed and now pass after output-policy preflight, late header generation and explicit undefined-only defaults. Deployment control files are excluded from the resource manifest, because hosts consume rather than serve them; nested same-name files remain hashed. The server serves required distribution license notices while denying development/source paths and escaped symlinks.

Hashes and check counts: [auto-integration-verification.json](evidence/auto-integration-verification.json). The [setup guide](ONE_STEP_SETUP.md) documents the one-setting configuration, defaults, live API and server/host examples.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:e2e
pnpm test:package
node scripts/prepare-jsp.mjs
mvn -B -f examples/jsp-servlet/pom.xml package
node examples/security-server/server.mjs examples/react-vite/dist --port 4174
```

The package consumer check uses offline cached dependencies after installation. The local Maven binary was the same temporary SHA-512-verified Maven 3.9.11 used for the foundation run.

## Boundaries

Automatic injection applies to supported Vite HTML/module browser builds. Development/HMR stays unrestricted; runtime SDK injection and header artifact generation each support explicit opt-out. Shortcut/context-menu interception still requires explicit opt-in. Inputs/selects/textareas/editable content are exempt. Live changes are local to the current page and reset to build settings on reload; there is no remote policy service or automatic persistence.

Strict obfuscation remains a build-time transform with potentially large size/runtime costs. Historical benchmark files describe the earlier hardening commit, not a fresh performance measurement of this integration. No external deployment, npm publication, remote CI run, or physical-device test occurred. No generic console lock or server authorization guarantee is claimed.
