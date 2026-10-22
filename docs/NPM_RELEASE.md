# npm release operations

The public package is **`uulab-webguard`**, with public access on `https://registry.npmjs.org`. Internal `@webguard/*` packages are not publication targets. The public facade bundles their runtime code and declarations; its external dependencies are declared normally.

Publication is **paused**. The preserved `.npm-release/uulab-webguard-0.3.0.tgz` and `.npm-release/release.json` are an older candidate and must not be published: they predate the freshness snapshots and current public build/Next/global exports. Preserve them while publication is paused. `node scripts/release-npm.mjs check` is read-only, performs no authentication or registry requests, and must reject this legacy candidate. Do not run preparation merely to clear this failure while the pause remains in effect.

The recorded historical registry release is `uulab-webguard@0.2.0`, published by `uulab` with matching downloaded SHA-512 and registry consumer checks. This is historical evidence, not a fresh registry observation: see [registry release evidence](evidence/npm-release.json), [npm website proof](evidence/npm-publication-0.2.0.png), and the retained [0.1.0 receipt](evidence/npm-release-0.1.0.json). Current source/package metadata targets 0.3.0; source changes do not establish that version as published.

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

## After publication resumes: prepare, review and publish

```sh
pnpm install --frozen-lockfile
pnpm release:prepare
node scripts/release-npm.mjs check
pnpm test:npm
node scripts/verify-npm-consumer.mjs --prepared --vite 7.3.1
RELEASE_TARBALL="$(node -p "'.npm-release/' + require('./.npm-release/release.json').filename")"
node scripts/verify-generic-consumer.mjs --tarball "$RELEASE_TARBALL"
node scripts/verify-next-consumer.mjs --tarball "$RELEASE_TARBALL"
node scripts/release-npm.mjs check
pnpm release:publish
pnpm release:readback
pnpm test:npm:registry
node scripts/verify-npm-consumer.mjs --registry --vite 7.3.1
```

`release:prepare` first runs the repository build, then writes the exact tarball, SHA-512, public file inventory, and deterministic SHA-256 snapshots under ignored `.npm-release/`. It compares the archived contents with the current package before recording them. The source snapshot covers package sources, metadata/build configuration, lockfile, root build configuration, and the documentation/license/server inputs used to generate the public package. A direct `node scripts/release-npm.mjs prepare` call requires a completed build; snapshots cannot prove an earlier build used the recorded source. Always use `pnpm release:prepare` for a resumed release.

Review the newly prepared record and run the prepared consumers against that exact tarball. `check` and `release:publish` reject a missing/legacy snapshot, changed/deleted/added public files, same-version metadata edits, or changed build inputs. Rebuild, reprepare and repeat candidate review if any of these change. Receipt-only changes under `docs/evidence/` do not invalidate the candidate. The gate runs before `npm whoami`, registry lookup or publishing. `check` does not write package or candidate files and returns a nonzero exit status for a stale candidate.

`release:publish` additionally checks registry ownership and version availability, then uploads exactly the recorded tarball. It does not publish other workspaces. A matching previously published version triggers full downloaded-tarball/latest-tag readback; a different existing version is rejected rather than replaced or unpublished.

`release:publish` runs the pinned official npm CLI 11.21.0 without replacing the global npm installation, so passkey publishing can use the supported browser challenge. Keep the publishing command in an interactive terminal and do not redirect its output: otherwise npm cannot complete the interactive authentication flow. A CLI login may be followed by a separate publish authentication challenge. Use the logged-in browser for the printed URL; no OTP or token needs to be pasted into chat.

Only registry readback is retried: at most six attempts with bounded delays. Publication is executed once. Version/latest propagation delays, network interruptions, HTTP 429 and 5xx can be retried; a different integrity or unexpected tarball origin stops immediately. Non-success responses are canceled before retrying. If npm accepts publication but readback stays unconfirmed, the command explicitly reports that publication succeeded and instructs the operator to run `release:readback`; never republish or unpublish as a retry. Unconfirmed checks do not write successful registry evidence.

`release:readback` verifies the recorded tarball identity/integrity but deliberately does not require current source/package snapshots, so historical registry evidence can be checked after local source changes. It confirms registry version, latest tag, metadata integrity and downloaded tarball bytes, and writes `docs/evidence/npm-release.json`. Preserve versioned previous receipts before this write. The external consumer verifier uses a temporary project and installs only the facade plus Vite, with no workspace aliases or internal package overrides. It checks declarations, file inventory, absence of internal dependencies/maps, actual builds, automatic Strict SDK startup, live controls, server headers, the installed `webguard-check` executable and browser errors. `--prepared` reads the reviewed filename from `.npm-release/release.json`; registry mode installs the version from current package metadata and must run after publication. Tarball mode is not registry evidence.

## Update the public onboarding

After registry verification succeeds, rebuild and deploy the Korean onboarding:

```sh
pnpm deploy:build
pnpm exec wrangler deploy
WEBGUARD_PUBLIC_URL=https://webguard.uulab.co.kr pnpm test:public
```

Confirm `/docs/#install` and `/docs/INSTALL.ko.txt`, record the returned deployment version, and refresh the public deployment evidence. Preserve the prior release records; record this candidate's final source commit, tarball hash and actual registry/browser observations separately.

References: [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/), [public package publication](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).
