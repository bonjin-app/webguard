# Production execution compatibility hardening

The user requested raising WebGuard to production quality. Preserve npm publication pause, held release artifacts, global Codex settings and previously pinned CDN files. Keep the approved public visual design. Do not substitute automated checks for customer/device/external review approval.

## Confirmed defects and chosen changes

1. **Cross-file execution failure:** distinct classic scripts transformed with the same High policy seed can generate the same global decoder helper. Loading a second file can break a delayed call into the first. Add central helper namespacing without renaming application globals or weakening protection. Retain explicit namespace overrides and fixed-seed reproducibility; random-seed transformations need independent namespaces. Test actual delayed calls in all three native engines. The original CI timeout lacks its failing generated file and remains unconfirmed; do not attribute it solely from this separate reproduction.
2. **Incomplete verification accepted:** native PHP can be skipped while the aggregate is marked passed. Add explicit required-native-runtime acceptance; CI provisions and requires Python/PHP, propagates skips accurately, and verifies the declared Node 22.12.0 floor alongside the current Node 22.x runtime. A missing PHP negative test must fail before preparing fixtures or launching browsers.
3. **Browser evidence boundary:** record the actual macOS Chrome smoke separately from automated engine results; no implicit support for older browsers or physical mobile devices. Restore initial demo settings after testing.

## Ownership and checks

- Deep worker: obfuscator namespace generation and meaningful unit/native collision regressions; fixed seeds, map/comment/module URL preservation, browser-safe options code.
- Root: required runtime verification, CI, support/API documentation, final integrated validation, exact candidate/public readback.
- Internal reviewer: bounded review of the final changes. This does not replace independent external security approval.

Run fresh build/type/lint/README/format/unit checks; the complete three-engine browser suite; installed consumers on both Node versions; required native SSR and JSP; performance budgets and dependency audit. Then publish a new immutable download/CDN candidate and verify actual public bytes, headers, private paths and browser flows. Keep predecessor releases intact. Persist failing and passing evidence with scope and source identity.

Stable promotion additionally requires actual-application pilot approval, physical target-device coverage, longer sessions/BFCache and independent security review. Missing evidence remains pending; changing a label cannot grant production approval.
