# Direct downloads and CDN

The service is WebGuard. `uulab-webguard` remains the technical package identifier. Public web download candidates are separate from the held npm publication artifacts. Never use `release:prepare` or `release:publish` to refresh website downloads while publication is paused.

```sh
pnpm demo:build
pnpm deploy:prepare
```

The demo build first builds the package, packs a separate candidate with lifecycle scripts disabled, protects the browser IIFE with Strict obfuscation, verifies its global API, and adds it to `distributions/`. It then rebuilds the apps and copies the validated retained distribution into the staged demo. The canonical `.npm-release/` files are compared before/after and remain untouched. A checkout without those private local artifacts is supported too.

`distributions/catalog.json` selects the current candidate and lists retained releases. IDs combine the package version and a digest of all four files. The catalog is served at `/downloads/catalog.json` with `no-store`. Exact retained assets are served as follows:

| URL                                                     | Purpose                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/cdn/releases/<id>/webguard.global.js`                 | Obfuscated classic browser bundle; CORS, cross-origin CORP, JavaScript MIME, immutable caching |
| `/downloads/releases/<id>/webguard.global.js`           | Same bytes as an attachment                                                                    |
| `/downloads/releases/<id>/uulab-webguard-<version>.tgz` | Node build tool/SDK package candidate; dependencies install separately                         |
| `/downloads/releases/<id>/webguard-init.js`             | Editable external initializer example; host locally after reviewing options                    |
| `/downloads/releases/<id>/THIRD_PARTY_NOTICES.txt`      | Project license and third-party notices                                                        |

Keep **all retained release directories and catalog entries in source control**. Never replace a file behind a pinned URL, and do not deploy a build that drops URLs already supplied to users. The generator verifies all retained bytes before appending a release; deployment verifies them again before copying. A changed retained file, symlink, unexpected file, invalid metadata or concurrent writer fails publication. Retention is bounded at 100 releases/1 MiB catalog; reaching the limit fails without deleting anything. Plan migration explicitly before changing that limit.

The sibling `distributions.lock/` prevents concurrent writers. If a process is terminated abruptly, inspect for an active builder and preserve the last valid catalog before recovering a stale lock or abandoned staging directory. Do not remove a lock while a builder is active. Ordinary exceptions clean up staging and leave the previous release selectable.

Clients should copy the catalog-selected CDN URL **and its SRI together**, using `defer` and `crossorigin="anonymous"`, then load their reviewed initializer from their own origin. The initializer exposes `window.webguard` so applications can call `update()` and `destroy()`. It is an example, not automatic authorization or server policy enforcement. Browser-delivered code remains observable.

Download `.tgz` candidates are installable with `npm install -D ./uulab-webguard-0.3.0.tgz`; they are not offline executables and require Node 22.12+ and dependency access. The CDN cannot obfuscate existing application files. See [Korean installation](INSTALL.ko.md) and [environment guide](ENVIRONMENTS.ko.md).
