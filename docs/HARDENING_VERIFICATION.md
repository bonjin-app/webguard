# Generic hardening verification

Checked locally on 2026-10-20 (Asia/Seoul), following the foundation-stage record, for commit `c8f2748` before automatic SDK integration. This change strengthens the reusable toolkit; no target service backend or external deployment was integrated.

## Observed results

- All 12 build tasks passed; final documentation app rebuilt after its guide update.
- Strict TypeScript, ESLint and formatting passed.
- 115 unit/integration tests passed, zero failures. New checks cover High defaults/behavior, header API validation, malformed and encoded origin injection, typed public API and the built CLI `headers` subprocess.
- 39 Playwright tests passed across Chromium, Firefox and WebKit, zero skipped or failed. Each installed engine rejected raw-string HTML sinks with enforced Trusted Types. This is evidence for these installed engines, not every browser version.
- Existing functionality remained usable under Strict + generated response policy: React state, forms, routing and lazy imports. Vanilla examples, docs and isolated Playground regressions also passed.
- CSP blocked inline event handlers and unapproved external scripts. Browser-controlled code still executed and changed local page state, as expected. Tests deliberately preserve this distinction.
- Four real Java 17 / Tomcat 10.1.61 HTTP tests passed and Maven produced a WAR. HTTP checks now assert the JSP Trusted Types and form policy directives.
- All four example integrity manifests matched the final local files.
- A focused independent read-only review found a URL/CSP grammar mismatch in the initial allowlist validator. Post-normalization exact-host validation and regression tests close the reported raw/encoded wildcard and directive-delimiter paths; the final narrow review found no further actionable defect.

Hashes and check summary: [hardening-verification.json](evidence/hardening-verification.json). Reproduction commands are in the [foundation verification guide](VERIFICATION.md); `node packages/cli/dist/bin.js headers` prints the new policy JSON.

## Measured cost

[Node fixture](evidence/benchmark-node.json) and [browser samples](evidence/benchmark-browser.json) were refreshed against this change. The React comparison protects the entire application bundle, including bundled React dependencies, using Strict/High with default RC4. Three fresh headless Chromium contexts per case on this host produced these arithmetic means:

| Metric                  |     Unprotected | Strict protected |
| ----------------------- | --------------: | ---------------: |
| Resource transfer bytes |         227,632 |        1,778,396 |
| Load time               |        216.7 ms |         286.0 ms |
| Browser task CPU time   |         0.125 s |          0.376 s |
| Point-in-time JS heap   | 3,043,517 bytes | 11,040,665 bytes |

These are small, local, noisy samples without statistical significance or device-wide guarantees. Transfer bytes are the local HTTP resource measurements, not an assumed compressed CDN payload. Heap is neither peak memory nor process RSS. The Node fixture grows from 151 bytes to 6,311 bytes at High; tiny inputs incur large decoder/wrapper overhead. Apply stronger settings to selected application bundles, consider vendor exclusions/chunking and measure the actual integration. Standard remains the default.

## Deployment boundary

The new header command prints values; operators must apply them as HTTP response headers. Playwright fulfilled routes emulate those headers; the JSP example additionally serves its explicit policy from a live local Tomcat. No production CDN/server policy was changed. Trusted Types enforcement can break raw-string sinks and widgets; report-only/off modes are explicit compatibility choices.

RC4 encoding is reversible obfuscation. Debugging-plane execution remains under browser control. Server authorization must hold without the SDK. Global Codex settings, external publishing, remote CI and physical-device tests are outside this change and were not performed.
