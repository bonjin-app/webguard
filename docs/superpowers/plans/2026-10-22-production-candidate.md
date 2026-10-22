# WebGuard production candidate implementation plan

> **For agentic workers:** Use the assigned bounded files; do not spawn recursively. Root implements policy/soak/CI, a deep worker fixes verified runtime reentrancy, and a routine worker repairs the browser benchmark.

**Goal:** Produce a verifiable 0.3.0 candidate for controlled production pilots, without declaring stable production support or publishing npm.

**Architecture:** Keep existing APIs and adapters. Repair verified lifecycle defects, make browser performance measurement build its own two comparable artifacts, and add repeatable runtime resource/behavior checks. Existing installed-consumer and E2E jobs remain required. Stable promotion additionally needs evidence outside this automated run.

**Tech stack:** TypeScript, Vite, Playwright Chromium/Firefox/WebKit, Vitest, Node 22+, pnpm 11.10.0.

## Constraints and success criteria

- Keep global Codex settings, held `.npm-release` artifacts and existing pinned CDN releases unchanged. No npm publish or automatic stable promotion.
- Do not add DevTools traps, forced navigation, hidden telemetry, or absolute secrecy claims. Preserve strong obfuscation and explicit policy ownership.
- Native modal replacement must leave no modal or restrictions after synchronous destroy/disable callbacks.
- Reentrant automatic initialization must leave one reachable owner or reject without orphan listeners; teardown must restore ordinary input behavior.
- Repeated update/disable/destroy/reinstall must not accumulate owned timers, listeners or observers. Browser watch evidence is a bounded test, not multi-hour/device certification or real BFCache proof.
- Benchmark baseline/protected artifacts must be generated from the same source in the same invocation, using equivalent non-protection build settings. Serve real protected response policies. Keep build time distinct from browser runtime and report host-dependent observations honestly.
- Establish deterministic payload ceilings for the maintained React fixture after collecting fresh measurements. Do not introduce a universal latency claim or silently relax protection to meet a limit.
- Document required runtime versions, exact tested adapters, security reporting, updates and rollback procedures. Stable approval requires a real-application pilot, physical-device evidence and independent review; missing evidence remains explicitly pending.

## Tasks

- [x] **1. Repair runtime reentrancy.** Add failing native-browser modal replacement tests and a failing recursive auto-install unit test. Fix `packages/browser/src/blocker.ts` / `index.ts`, verify all three engines, and preserve the API contract.
- [x] **2. Verify repeated lifecycle ownership.** Add `tests/e2e/sdk-lifecycle.spec.ts` with an isolated official built SDK fixture, real timer samples and repeated on/off/destroy/reinstall. Instrument browser resource ownership within the fixture only; verify ordinary input and zero residual owned resources after teardown. Keep duration and evidence scope explicit.
- [x] **3. Replace stale browser measurements.** Repair `scripts/benchmark-browser.mjs`; fresh temp builds, source/artifact hashes, protected headers, warm-up, five alternating paired samples, CPU deltas, payload compression, medians/range. Negative tests must reject incomplete/over-budget metrics.
- [x] **4. Define candidate policy and budgets.** Add `docs/PRODUCTION_READINESS.ko.md`, `docs/SUPPORT.md`, deterministic fixture budget config; update `SECURITY.md`, changelog and all four README references. Provide install/update/rollback and CSP report-only rollout recipes without implying that disabling runtime removes existing HTTP policies.
- [ ] **5. Integrate and verify.** Add fresh browser benchmark and production dependency advisory audit to CI; retain installed-consumer and complete E2E jobs. Run build/type/lint/format/unit, scoped new native browser cases, same-byte installed consumers and GitHub CI. Preserve exact held/config/CDN hashes. Record discovered defects, final passing scope and external pending criteria.

## Review focus

- A host callback destroys or updates the SDK during native close/focus dispatch.
- Initialization emits synchronously before its singleton is published.
- Policy toggles and repeated reinstall leave obsolete callbacks, timers or DOM observers.
- Benchmark accidentally compares a new baseline with stale protected output or a different minifier/target.
- A rollback disables runtime but leaves CSP/Trusted Types response enforcement active; document layers independently.

The user requested setting a goal and proceeding. This plan executes the already authorized SDK hardening scope; it does not request another approval or change the npm pause.

## Local verification checkpoint

2026-10-22: 653 unit/integration tests, 358 native E2E passes with two documented non-Chromium CDP skips, and 15 scoped reentrancy/lifecycle cases passed. The web download and all installed consumers use the same candidate tarball. Local PHP and Maven are unavailable and are not counted as passes; CI must execute them. See [local evidence](../../evidence/production-candidate-2026-10-22/README.md). Task 5 remains pending at this committed local checkpoint until matching GitHub CI and public deployment readback complete.
