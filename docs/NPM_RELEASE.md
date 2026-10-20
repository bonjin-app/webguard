# npm release operations

The public distribution target for this release is **`uulab-webguard@0.2.0`**, public access on `https://registry.npmjs.org`. Internal `@webguard/*` packages are not publication targets. The public facade bundles their runtime code and declarations; its external dependencies are declared normally.

Current state (2026-10-20): `uulab-webguard@0.1.0` is publicly published by `uulab`, with `latest` pointing to 0.1.0. The downloaded registry tarball matches the reviewed SHA-512. Fresh registry consumers passed with Vite 7.3.1 and 8.3.4, including type resolution, protected builds, automatic SDK, live controls, server policies and zero Chromium page errors. See [registry release evidence](evidence/npm-release.json).

## Authenticate

The account owner must complete npm login and the CLI authorization flow. Website sign-in alone is not sufficient. Never paste a password, OTP or token into chat.

```sh
npm login --auth-type=web --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
```

If the installed CLI cannot finish web authentication, use the official CLI without changing the global installation:

```sh
npm exec --yes --package=npm@11.21.0 -- npm login --auth-type=web --registry=https://registry.npmjs.org
```

Provider-required 2FA/publish approval remains a human step. Do not weaken account authentication or create a workaround token just to bypass that step.

## Prepare, verify and publish

```sh
pnpm install --frozen-lockfile
pnpm release:prepare
pnpm test:npm
node scripts/verify-npm-consumer.mjs --prepared --vite 7.3.1
npm publish .npm-release/uulab-webguard-0.2.0.tgz --dry-run --access public --ignore-scripts --registry=https://registry.npmjs.org
pnpm release:publish
pnpm release:readback
pnpm test:npm:registry
node scripts/verify-npm-consumer.mjs --registry --vite 7.3.1
```

`release:prepare` writes the tarball and SHA-512 inventory under ignored `.npm-release/`. `release:publish` checks that inventory, current identity, registry ownership and version availability, then uploads exactly that tarball. It does not publish other workspaces. A matching previously published version triggers full downloaded-tarball/latest-tag readback; a different existing version is rejected rather than replaced or unpublished.

`release:publish` runs the pinned official npm CLI 11.21.0 without replacing the global npm installation, so passkey publishing can use the supported browser challenge. Keep the publishing command in an interactive terminal and do not redirect its output: otherwise npm cannot complete the interactive authentication flow. A CLI login may be followed by a separate publish authentication challenge. Use the logged-in browser for the printed URL; no OTP or token needs to be pasted into chat.

Only registry readback is retried: at most six attempts with bounded delays. Publication is executed once. Version/latest propagation delays, network interruptions, HTTP 429 and 5xx can be retried; a different integrity or unexpected tarball origin stops immediately. Non-success responses are canceled before retrying. If npm accepts publication but readback stays unconfirmed, the command explicitly reports that publication succeeded and instructs the operator to run `release:readback`; never republish or unpublish as a retry. Unconfirmed checks do not write successful registry evidence.

`release:readback` confirms registry version, latest tag, metadata integrity and downloaded tarball bytes, and writes `docs/evidence/npm-release.json`. Preserve versioned previous receipts before this write. The external consumer verifier uses a temporary project and installs only the facade plus Vite, with no workspace aliases or internal package overrides. It checks declarations, file inventory, absence of internal dependencies/maps, actual builds, automatic Strict SDK startup, live controls, server headers, the installed `webguard-check` executable and browser errors. `--prepared` reads the reviewed filename from `.npm-release/release.json`; registry mode installs the version from current package metadata and must run after publication. Tarball mode is not registry evidence.

## Update the public onboarding

After registry verification succeeds, rebuild and deploy the Korean onboarding:

```sh
pnpm deploy:build
pnpm exec wrangler deploy
WEBGUARD_PUBLIC_URL=https://webguard-demo.uulab.workers.dev pnpm test:public
```

Confirm `/docs/#install` and `/docs/INSTALL.ko.txt`, record the returned deployment version, and refresh the public deployment evidence. Preserve the prior release records; record this candidate's final source commit, tarball hash and actual registry/browser observations separately.

References: [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/), [public package publication](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).
