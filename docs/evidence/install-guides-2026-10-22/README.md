# Environment installation guides — 2026-10-22

Installation now starts at `/docs/#install` with eight choices: Vite/React/Vue, Next.js, Webpack/esbuild, HTML/jQuery, Java/JSP, Python, PHP, and CDN/manual SDK. Each opens a separate static Korean quickstart with prerequisites, installation, named files and configuration, build/run commands, expected results, troubleshooting and deeper references.

The existing full guides, API URLs and install-code anchors remain available. Current-document topics precede cross-environment/reference navigation. Mobile pages use a compact horizontal topic list and a direct environment-selector link, bringing the document title into the first viewport. Static guides remain readable without application JavaScript.

The Java/Python/PHP guides distinguish installing into an existing application from cloning and running this repository's examples. Their named helper scripts preserve original inputs, protect client JavaScript into a fresh directory, copy only three required public JS files without overwriting existing assets, and print SRI for the final bytes. Java uses the actual JSP context path. Server templates, business authorization and host HTTP policy remain separate responsibilities; the CDN guide explicitly distinguishes runtime SDK loading from application obfuscation.

All eight quickstarts are copied into the downloadable package. Four README languages link to the same Korean environment-specific guides. The package consumer allowlist checks these exact additional Markdown files rather than accepting arbitrary root files.

## Fresh local verification

- `pnpm verify`: **676 tests / 53 files passed**, including generation, link/anchor and metadata coverage; source typecheck, lint and four-language README checks passed.
- `pnpm format:check`: passed.
- Installation, existing public-guide, download and setup browser suites: **81 passed** across Chromium, Firefox and WebKit. These check all eight routes, downloads, legacy anchors, mobile overflow, compact navigation and first-viewport titles. Desktop and 390px mobile screenshots were visually inspected.
- Same downloadable tarball installed in fresh Vite 7, Vite 8, generic and Next projects: passed. Python SSR passed across three browser engines. Native PHP was unavailable on this machine and is explicitly skipped; required-native-runtime hosted CI remains a separate gate. See [installation receipt](local-installations.json).
- Bounded internal review found no remaining actionable P1/P2 issues after correcting a broken server-policy anchor, package-relative repository links and the JSP context path. This is internal review, not external security certification.

Candidate: `0.3.0-7fffc24439d4935b`; package SHA-512: `c962f4610947e58fb4cf6604966931688c67d2d4932e305f13fffc853cae7130a74dbe38996425ef0ae82f7ec33ee194836bd4b72c6945ff7c0dbfc175c3eb4b`.

This source checkpoint records local verification. Deployment and exact public byte/header/SRI readback are recorded separately after publication. npm publication stays paused. The previous six immutable release directories, held npm release files and global Codex configuration are preserved.
