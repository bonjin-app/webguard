# Runnable demo verification

Local verification on 2026-10-20 (Asia/Seoul), following automatic integration commit `ba4b571`.

- Root workspace build: all 12 tasks passed. Demo assembly additionally built docs and React/JS/TS at their mounted public bases.
- TypeScript, ESLint and formatting passed.
- 151 unit/integration tests passed, including four real HTTP gateway tests for mount isolation, response policies, redirects, path rejection and startup validation.
- 48 browser tests passed across Chromium, Firefox and WebKit, zero failures/skips. New checks exercise a one-click High sample, live SDK trials, integration-code selection, and same-origin navigation with counters/lazy modules in all three mounted applications. Existing sandbox and protection checks also passed under the gateway.
- A further local Chromium check ran all three curated High samples and compared real source/protected logs: cart 90/95, form true/false, and Korean region totals 5/4. At 390px the document fit the viewport without horizontal scrolling. [Sample results](evidence/demo-samples.json).
- All three mounted applications matched their local manifests and passed actual loopback HTTP deployment/resource/source-probe verification. Reports refer to final demo directories rather than staging paths. [Readback](evidence/demo-readback.json).
- Desktop/mobile screenshots were captured from the real built gateway and visually inspected: [desktop](evidence/demo-desktop.png), [mobile](evidence/demo-mobile.png).
- Focused independent read-only review found no actionable gateway/path/policy/transaction defect. The gateway is a same-origin convenience for trusted demos, not hostile-tenant isolation.

Reproduce with `pnpm install --frozen-lockfile`, `pnpm verify`, and `pnpm test:e2e`. Run the complete demo using `pnpm demo`; an already-built bundle can be served with `node scripts/demo-server.mjs --port 4173`. See [the walkthrough](DEMO_GUIDE.md).

These are local desktop-engine and loopback HTTP observations. This work did not publish packages, deploy public hosting, run remote CI, test physical devices, or change Codex configuration. JSP/Tomcat is available through its separate preparation instructions; it is not a browser-run Java demo. Clipboard success depends on browser permission; the UI supplies selection for manual copying when writing is unavailable.
