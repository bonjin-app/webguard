# WebGuard generic hardening update

User request: emphasize strong obfuscation and resistance to console/script-injection attempts. User selected the generic toolkit scope rather than a specific service/backend integration.

- Preserve compatible Standard defaults and all global Codex settings.
- Strengthen existing Strict/High transforms: default reversible RC4 string encoding, higher string coverage and control-flow transformation, splitting/function wrappers/numeric transforms.
- Keep module specifiers, public API contracts and legal notices intact; keep dynamic code generation/debugger loops disabled.
- Add a pure response-header generator in core and a read-only CLI `headers` command. Default to restrictive CSP and enforced Trusted Types; provide explicit off/report-only and exact-origin allowlists. Do not silently change a host server.
- Validate malformed/header-injection origins and unknown options. No automatic telemetry or policy-report endpoints.
- Demonstrate Strict React under generated response headers; test inline/external injection blocks and supported Trusted Types sinks.
- Explicitly test/document that browser-controlled code execution remains possible. Do not claim generic authorization or a console lock.
- Benchmark and report compatibility/performance costs; no publish or deployment.

Implementation: failing tests → core/preset/options/CLI changes → full build/types/lint/unit integration → three-engine attack and functionality tests → focused security review → evidence update.
