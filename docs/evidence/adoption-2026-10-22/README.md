# WebGuard adoption checkpoint — 2026-10-22

This local checkpoint simplifies installation and repeatable verification. npm publication remains paused; it does not approve all production applications.

## Implemented flow

1. Select npm or pnpm in the demo/documentation downloads section and copy the validated catalog’s immutable package URL command. No manual file move or path substitution is required. The source of the command is fixed to the WebGuard origin and strict catalog paths; it never uses arbitrary catalog/browser hosts.
2. Preserve existing build configuration and add the documented integration once. Vite and static output use generated policies; Next retains its SSR/CSP contract and is not treated as a static build.
3. Run `webguard doctor [directory] [--json]` (default `dist`) to diagnose local manifest/final bytes/header-policy format. It is read-only, does not execute configuration or contact a network, returns nonzero with redacted next actions, and rejects Next server output. Supported `.htm` and uppercase static extensions are included.
4. Run the application, apply host policies and compare deployment bytes/HTTP responses using `webguard-check`. Doctor does not certify obfuscation strength, browser behavior, business authorization, deployment or production approval.

Reload/failure clears the old install/CDN command handlers and links. Pending clipboard completions cannot overwrite a later load’s status. Local file download and pinned CDN/SRI alternatives remain available. npm/pnpm requirements and lockfiles are distinguished: SDK Node >=22.12, pnpm 11 Node >=22.13; `npm ci` versus `pnpm install --frozen-lockfile`.

## Fresh local evidence

- Full source test suite: **675 passed / 53 files**; typecheck, lint, API mapping and four-language README validation passed (144 relative links, 52 code blocks, 5 typed examples).
- Downloads/setup browser suite: **24 passed** across Chromium, Firefox and WebKit. Exact catalog URL, selected-manager clipboard text, loading/error/retry, hostile catalog, generator policy choices and mobile overflow were checked.
- [Same-candidate installation receipt](local-installations.json): Vite 7/8, generic tools and Next passed. Python SSR passed; local native PHP is unavailable and the aggregate explicitly reports `passed-with-skips`. Hosted required-runtime CI remains required.
- [Installed CLI receipt](installed-cli.json): real packaged doctor accepts the build, rejects intentionally changed JS with exit 1, restores exact bytes in `finally`, and accepts the restored build.
- Internal bounded review found/fixed legacy-extension false failures, pnpm runtime wording and manager-specific CI guidance. It is not an independent external security certification.

New immutable candidate: `0.3.0-561009fcddae08e9`; package SHA-512 `7ea530770cf4401ed64ab0aec0609f7402b88344373ceb898ed26c8cc1d68100e9adfb1e2cdfc125f99ecf1f01d7e5aa1bf63c7a8eb1b4b2b539af28054f97ff`.

This file records the local checkpoint before hosted CI and public readback. The next stage must compare the deployed package/headers/SRI and install the literal hosted URL in fresh npm and pnpm projects. Previous pinned releases, held npm artifacts and global Codex configuration are preserved. [Production gates](../../PRODUCTION_READINESS.ko.md) and [install/update/recovery steps](../../INSTALL.ko.md) continue to apply.
