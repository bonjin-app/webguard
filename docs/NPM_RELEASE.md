# npm release operations

The only public distribution target is **`uulab-webguard@0.1.0`**, public access on `https://registry.npmjs.org`. Internal `@webguard/*` packages are not publication targets. The public facade bundles their runtime code and declarations; its external dependencies are declared normally.

Current state: release candidate verified locally; npm identity lookup returned HTTP 401, so registry publication and registry consumer verification are incomplete. The existing public demo remains on its previously verified deployment. New onboarding pages are staged locally and must be deployed after publication.

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
node scripts/verify-npm-consumer.mjs --tarball .npm-release/uulab-webguard-0.1.0.tgz --vite 7.3.1
npm publish .npm-release/uulab-webguard-0.1.0.tgz --dry-run --access public --ignore-scripts --registry=https://registry.npmjs.org
pnpm release:publish
pnpm release:readback
pnpm test:npm:registry
node scripts/verify-npm-consumer.mjs --registry --vite 7.3.1
```

`release:prepare` writes the tarball and SHA-512 inventory under ignored `.npm-release/`. `release:publish` checks that inventory, current identity, registry ownership and version availability, then uploads exactly that tarball. It does not publish other workspaces. A matching previously published version triggers full downloaded-tarball/latest-tag readback; a different existing version is rejected rather than replaced or unpublished.

`release:readback` confirms registry version, latest tag, metadata integrity and downloaded tarball bytes, and writes `docs/evidence/npm-release.json`. The external consumer verifier uses a temporary project and installs only the facade plus Vite, with no workspace aliases or internal package overrides. It checks declarations, file inventory, absence of internal dependencies/maps, actual builds, automatic Strict SDK startup, live controls, server headers and browser errors. Registry mode must be run after publication; tarball mode is not registry evidence.

## Update the public onboarding

After registry verification succeeds, remove the pending-publication note from the root README and this status paragraph. Rebuild and deploy the staged Korean onboarding:

```sh
pnpm deploy:build
pnpm exec wrangler deploy
WEBGUARD_PUBLIC_URL=https://webguard-demo.uulab.workers.dev pnpm test:public
```

Confirm `/docs/#install` and `/docs/INSTALL.ko.txt`, record the returned deployment version, and refresh the public deployment evidence. Preserve the prior release records; record this candidate's final source commit, tarball hash and actual registry/browser observations separately.

References: [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/), [public package publication](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).
