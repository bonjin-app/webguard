# Production candidate: local checkpoint, 2026-10-22

This records the locally verified candidate before GitHub CI and public deployment. It is not stable approval, physical-device certification or an external security audit. npm publication remains paused.

## Corrected behavior

- Native modal close restores focus synchronously. A host focus callback can destroy, disable, update or rebaseline the SDK. Superseded requests now yield to the current owner instead of leaving an orphan modal or overwriting the replacement state.
- Automatic startup publishes its complete singleton before initial synchronous host callbacks. Reentrant installation reuses the reachable instance; startup failures release owned resources.
- Regression cases exercise actual Chromium, Firefox and WebKit native dialogs. A separate bounded internal review independently reproduced and rechecked both state-reconciliation cases in all three engines. This is internal review, not independent external approval.

## Local evidence

| Check                                                          | Result / scope                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build, README examples, types, lint and unit/integration tests | [verify.log](verify.log): 653 tests passed                                                                                                                                                                                                             |
| Repository formatting                                          | [format.log](format.log): passed at the code verification checkpoint                                                                                                                                                                                   |
| Full native-browser suite                                      | [local-e2e.log](local-e2e.log): 358 passed, 2 skipped; debugger-pause CDP cases are Chromium-only                                                                                                                                                      |
| New native regression and lifecycle cases                      | [native-lifecycle.log](native-lifecycle.log): 15 passed; these cases are also included in the full suite, not additional coverage to add to its count                                                                                                  |
| Isolated-store internal-package installation                   | [internal-package.json](internal-package.json): build, auto startup, client subpath, shortcuts and headers passed                                                                                                                                      |
| Installed public-package candidates                            | [installed-consumers/installations.json](installed-consumers/installations.json): Vite 7/8, generic static tools and Next passed with one tarball; SSR workspace build passed for Python; **local PHP skipped because its interpreter is unavailable** |
| Production dependency advisories                               | [production-dependency-audit.json](production-dependency-audit.json): registry lookup succeeded; zero reported advisories for the recorded workspace lockfile                                                                                          |
| Preservation                                                   | [preservation.json](preservation.json): global Codex config, held npm package/metadata and 12 previously pinned distribution files unchanged                                                                                                           |

Local Maven is unavailable. JSP preparation succeeded, but no local Java compilation/browser pass is claimed for this checkpoint. CI now requires `-Dwebguard.browser=true` and must verify Java/JSP in all three engines. Its installed-consumer SSR receipt must also be inspected for Python/PHP skips. A green workflow alone should not conceal a missing runtime.

The lifecycle fixture executes 100 update/disable/destroy/reinstall cycles, checks exact owned listener/timer/observer cleanup and normal input, and observes the visible-page watch for 10 seconds with at least 20 real samples per engine. Page lifecycle dispatch in the unit fixture is synthetic. These are bounded checks, not real BFCache or multi-hour/physical-device evidence.

## Fresh performance measurement

[browser-performance.json](browser-performance.json) retains environment, source/tool/output hashes, real protected HTTP policy, build timings, two warm-ups, five alternating pairs in fresh Chromium contexts, all samples and cleanup. Both variants are built from the same source in the same invocation. The fixture uses Strict/High protection with seed 42, the auto SDK and shortcut/context-menu opt-in.

- JavaScript totals: baseline 225,413 raw / 69,955 gzip / 60,215 Brotli bytes; protected 1,934,068 raw / 824,654 gzip / 692,469 Brotli bytes.
- This retained Apple M5 Max run observed median load 13.7 ms before and 101.1 ms after protection. This is a local fixture observation, not a latency SLA or isolated SDK initialization cost.
- Maintained fixture size budgets passed. Unit and executable negative checks reject invalid/over-budget input; an over-budget run preserves browser samples and cleanup evidence before exiting nonzero.
- Compression is computed per asset, not observed network encoding. CPU is a checkpoint delta; heap is point-in-time used JS heap. Strong protection has a substantial payload/CPU cost and requires application-specific budgets.

## Candidate identity and online checks

Public download candidate: `0.3.0-d1ed5a80dd1ea138`.

Package SHA-512: `c8704f519186ac4ae77e443f0d447d2f3b76dd9f01087244a0c5db3e36f8d2deefe6b4238aff27c1c3827863b8b7aa236d47a0b30ab3442a600ee57e194316e0`. This exactly matches the tarball installed by the consumer suite. The candidate is a direct download, not a newly published npm version.

This checkpoint does not claim a future CI or deployment result. The matching commit's [GitHub workflow](https://github.com/bonjin-app/webguard/actions/workflows/ci.yml) and its uploaded receipts establish CI results; deployed-byte/HTTP/native-browser readback establishes actual public reflection. Build and deployment dry-run passed locally. GitHub private vulnerability reporting was enabled and read back as enabled on 2026-10-22; [private report form](https://github.com/bonjin-app/webguard/security/advisories/new).

Actual-application pilots, physical browser/device verification, long-duration sessions, independent external security review and stable-release owner approval remain pending under the [candidate criteria](../../PRODUCTION_READINESS.ko.md). Browser-delivered resources remain inspectable and browser DevTools cannot be forcibly closed by this web SDK.
