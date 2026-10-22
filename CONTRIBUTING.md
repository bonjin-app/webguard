# Contributing

## README translations

Maintain [English](README.md), [한국어](README.ko.md), [日本語](README.ja.md) and [简体中文](README.zh-CN.md) together when installation paths, release status or support boundaries change. Keep package names, exported API identifiers and executable examples equivalent in all four editions. Label links to Korean-only detailed guides clearly. Preserve the npm publication pause until a release is explicitly authorized; README updates do not publish a package.

## Development

Use Node 22.12+ and pnpm 11.10.0. Install with `pnpm install --frozen-lockfile` and run `pnpm verify`, `pnpm format:check`, then `pnpm test:e2e` after installing the three Playwright engines. Build outputs are generated and not committed.

Write behavioral regression tests before changing transformations, path validation or browser hooks. Avoid tests that merely assert implementation text. Preserve ESM exports, dynamic import, serialization, async behavior, keyboard accessibility and cleanup. Never introduce debugger loops, hidden telemetry or claims of absolute source secrecy.

Use temporary directories for filesystem tests, and ensure failures preserve original inputs. Keep reports free of matched secret values. Compile public API type tests. Document actual evidence and explicitly distinguish headless engines, physical devices, deployed state and CI.

Do not publish @webguard packages: this scope is temporary and ownership has not been established. Resolve package identity, transitive notices, advisories and release provenance before publication. Releases should use a reviewed commit, frozen install, complete verification, recorded artifact hashes and npm trusted publishing/provenance where supported; this repository does not yet configure a publishing workflow.
