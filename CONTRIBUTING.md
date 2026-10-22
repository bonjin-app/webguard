# Contributing to WebGuard

Start with a small, reproducible change: describe the behavior to improve, add a regression test when behavior changes, and explain your verification. You do not need npm publishing credentials or a Cloudflare account to contribute.

## First contribution

Use **Node.js 22.13+** and **pnpm 11.10.0** for this workspace. Neither tool is included in the checkout. The public SDK's Node 22.12+ requirement is separate: pnpm 11 cannot bootstrap this repository on Node 22.12.

```sh
git clone https://github.com/bonjin-app/webguard.git
cd webguard
node --version
```

Choose one way to install the pinned package manager:

```sh
# If Corepack is installed in your Node environment:
corepack enable
corepack prepare pnpm@11.10.0 --activate
```

```sh
# Alternative, using npm provided by your Node installation:
npm install --global pnpm@11.10.0
```

Then install the lockfile exactly and build the local packages:

```sh
pnpm --version # expected: 11.10.0
pnpm install --frozen-lockfile
pnpm build
```

Installation downloads dependencies. Keep intentional dependency updates separate from unrelated fixes; do not regenerate the lockfile just to work around a frozen-install failure.

## Run and test a focused change

```sh
# Fast feedback after the initial build:
pnpm exec vitest run tests/unit

# Replace this path with the regression test you are changing:
pnpm exec vitest run tests/unit/browser-status.test.ts

# Start the playground during development:
pnpm dev
```

Use the URL printed by the development server. Production protection, policies and downloads need the built demo, which you can start with `pnpm demo`.

Run `pnpm verify` before submitting code changes: it builds packages and checks READMEs, types, lint and unit/integration tests. `pnpm format:check` checks repository formatting. For documentation-only changes, check the edited files with `pnpm exec prettier --check <paths>` and run the applicable documentation checks; explain what you ran.

| Change                                                | Additional verification                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| README installation paths, release status or examples | `pnpm readme:check`                                                     |
| Public API, types or function documentation           | `pnpm api:check`, relevant type/regression tests                        |
| Browser hooks, UI, CSP or build output                | `pnpm test:e2e`                                                         |
| Package exports or installation integration           | `pnpm test:package` and the relevant installed-consumer check           |
| Generic static assets / SSR templates / Next adapter  | `pnpm test:generic` / `pnpm test:ssr` / `pnpm test:next`, as applicable |

Before browser tests, install engines with `pnpm exec playwright install chromium firefox webkit`. On a supported Linux host needing system libraries, use `pnpm exec playwright install --with-deps chromium firefox webkit`. Native SSR checks additionally need the runtimes described in [support scope](docs/SUPPORT.md); an unavailable interpreter or skipped test is not passing compatibility evidence. CI runs broader checks; contributors do not need to deploy or publish to open a pull request.

Ordinary `dist` outputs and test reports are ignored. However, `pnpm demo`, `pnpm demo:build` and `pnpm test:e2e` prepare distribution downloads and may append a **tracked immutable candidate** under `distributions/releases` and update its catalog when SDK bytes change. Inspect `git status` afterward: include a candidate only when intentionally reviewed with its source change. Never overwrite or delete historical releases. Preparing a download candidate does not publish npm. Canonical guides are synchronized into packaged/generated copies by the build; inspect those changes separately from handwritten source.

## Find the right module

| Location                                                       | Responsibility                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/core`, `packages/shared`                             | Shared contracts, options and orchestration                                               |
| `packages/obfuscator`                                          | Browser JavaScript transformations                                                        |
| `packages/integrity`                                           | Hashes and integrity verification                                                         |
| `packages/browser`                                             | Browser runtime guards and lifecycle cleanup                                              |
| `packages/cli`, `packages/vite-plugin`                         | CLI and Vite integration                                                                  |
| `packages/npm`                                                 | Public `uulab-webguard` facade, exports and Next integration                              |
| `apps/playground`, `apps/docs`                                 | SDK demo and documentation website                                                        |
| `examples`                                                     | Integration fixtures and server recipes                                                   |
| `tests/unit`, `tests/integration`, `tests/e2e`, `tests/public` | Focused behavior, package/filesystem integration, local browsers and deployed-site checks |
| `docs`, `scripts`                                              | Canonical guides and build/verification tooling                                           |

Internal `@webguard/*` packages are workspace modules, not public installation targets. Edit canonical guides under `docs` rather than generated website HTML or packaged copies; `pnpm build` synchronizes metadata and guides.

## Keep changes safe and reviewable

- Write behavioral regressions before changing transformations, path validation or browser hooks. Avoid tests that merely assert implementation text.
- Preserve ESM exports, dynamic imports, serialization, async behavior, keyboard accessibility and listener/timer cleanup. Explain backwards-incompatible changes and migration paths.
- Use temporary directories for filesystem tests. Failure must preserve original inputs; private reports and source maps must remain outside public output.
- Never add debugger loops, hidden telemetry or claims of absolute source secrecy. Browser-delivered resources remain observable; a web SDK cannot reliably disable or close DevTools.
- Use synthetic, sanitized fixtures. Do not submit proprietary source, credentials, customer data or matched secret values in tests, logs, screenshots or issue attachments.
- State what you actually verified. Headless engines, physical browsers/devices, CI and deployed bytes are different evidence. Record skips, missing runtimes and untested cases.

## Keep the four READMEs aligned

Maintain [English](README.md), [한국어](README.ko.md), [日本語](README.ja.md) and [简体中文](README.zh-CN.md) together when installation paths, release status or support boundaries change. Keep package names, exported API identifiers and executable examples equivalent in all four editions. Label links to Korean-only detailed guides clearly.

Run `pnpm readme:check` after README edits. It checks language navigation, relative link destinations, same-file and linked Markdown section fragments (ATX headings and explicit anchor elements), section structure, executable example parity and JavaScript/TypeScript syntax. ES module and standalone SDK examples are type-checked against current package source without executing them. It complements installed-consumer/browser tests; it does not prove runtime compatibility.

## Report a problem or propose a feature

Use a [public bug report](https://github.com/bonjin-app/webguard/issues/new?template=bug_report.yml) for ordinary installation, compatibility or UI problems with a minimal sanitized reproduction. Use a [feature request](https://github.com/bonjin-app/webguard/issues/new?template=feature_request.yml) for a concrete user problem and expected behavior. Start integration questions with the [documentation](https://webguard.uulab.co.kr/docs/).

Suspected vulnerabilities go to [private security reporting](https://github.com/bonjin-app/webguard/security/advisories/new), following [SECURITY.md](SECURITY.md). Do not include working exploit details or secrets in a public issue. If private reporting is unavailable, request a private contact without disclosing the vulnerability.

## Release boundary

WebGuard 0.3.0 is an unpublished candidate; npm publication remains paused. A contribution or successful CI run does not authorize publication, deployment or stable promotion. Do not run release/publish/deployment commands for an ordinary contribution. Do not publish internal `@webguard/*` workspace packages.

Releases require a reviewed commit, frozen install, complete verification, retained artifact hashes and the [candidate acceptance criteria](docs/PRODUCTION_READINESS.ko.md). This repository does not configure an npm publishing workflow. See [support, rollout and rollback](docs/SUPPORT.md) for the current support boundary.
