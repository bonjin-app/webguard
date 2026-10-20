# npm release implementation plan

> **For agentic workers:** Use executing-plans for bounded implementation and independent final review.

**Goal:** Publish one installable `uulab-webguard` package and provide Korean installation, Vite, live controls and server-header guidance.

**Architecture:** Preserve internal `@webguard/*` workspaces. Bundle their implementations into one public facade so consumers never resolve an unrelated `@webguard` registry package. Resolve the injected browser SDK through the public package's own browser export.

**Tech Stack:** Node 22.12+, TypeScript, tsup, Vite 7/8, npm public registry.

**Spec:** User request in this chat: npm installation, one Vite configuration, actual publication and Korean guide. Existing one-setting contract: docs/ONE_STEP_SETUP.md.

## Global constraints

- Keep Codex configuration unchanged. Preserve existing public demo and internal imports.
- Public name `uulab-webguard` returned registry 404 on 2026-10-20; recheck immediately before publication.
- Only publish the reviewed facade tarball, never all internal workspaces. Access public; first version 0.1.0.
- No install scripts, private source maps, credentials or absolute local paths in published files.
- SDK automatic startup and Strict/High default stay compatible. HTTP header files require host application.
- npm browser login and any provider-required human authentication are required; never request tokens in chat.

## Review focus

- No unresolved internal workspace dependency in runtime code or declarations.
- Browser/client entry must not load Node/Vite/obfuscator code.
- Production SDK bootstrap must self-resolve outside this repository.
- A clean npm consumer must install only the public package and Vite, build and exercise live controls.
- Registry readback must match the exact reviewed tarball; distinguish packed tests from registry installation.

## Task 1: Public facade and package consumer

Files: packages/npm/**, packages/vite-plugin/src/app.ts, scripts/verify-npm-consumer.mjs; tests for public package resolution.

- [x] Add a regression that an independently packed npm consumer builds and starts SDK with no internal workspace overrides; observe failure before implementation.
- [x] Bundle index, browser, client and headers exports with declarations and public MIT notices. Add an internal runtime resolver factory while keeping existing webguardApp behavior.
- [x] Verify package file inventory, type resolution, absent maps/internal runtime imports, automatic SDK, actual browser behavior and emitted header artifacts.

## Task 2: Korean onboarding and release preparation

Files: docs/INSTALL.ko.md, packages/npm/README.md, README.md, scripts/release-npm.mjs, package.json, apps/docs/src/main.ts, apps/playground/src/examples.ts and main.ts.

- [x] Document npm install, Vite setup, build, F12 activation timing, live changes, CSP/Trusted Types compatibility and Node/Nginx/static host application.
- [x] Add explicit prepare/dry-run/publish/readback commands for the single reviewed tarball. Refuse package/version mismatch or unexpected registry ownership.
- [x] Run build, typecheck, lint, unit/integration tests, packed consumer and browser checks. Keep package readiness distinct from actual registry state.

## Task 3: Publish and verify

- [x] Confirm npm identity and available public name. Publish exact tarball, satisfying npm human authentication if prompted.
- [x] Read registry version/integrity and perform clean install without tarball/workspace overrides; repeat consumer build/type/browser checks.
- [x] Update public onboarding only with confirmed registry status, rebuild and deploy documentation/demo, then verify public routes.
- [x] Record exact release/deployment evidence and local commit. If provider authentication blocks, finish all independent work and state the precise remaining step.
