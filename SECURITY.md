# Security policy

This is a pre-release toolkit. No stable production support window has been declared. Report suspected vulnerabilities privately through [GitHub's private reporting form](https://github.com/bonjin-app/webguard/security/advisories/new). Private vulnerability reporting was enabled and verified on 2026-10-22. Do not post credentials, proprietary source or working exploit payloads into public issues; if private reporting becomes unavailable, first request a private contact without disclosing the exploit.

Candidate support scope, update and rollback procedures are documented in [SUPPORT.md](docs/SUPPORT.md). [Production candidate criteria](docs/PRODUCTION_READINESS.ko.md) require application/device evidence and independent review before stable approval. CI success is automated evidence, not an independent security certification or stable release authorization.

Include the commit, dependency versions, minimal sanitized reproduction, expected trust boundary and actual impact. No telemetry or automatic external reporting is enabled by this library.

Client-side source secrecy and developer-tool prohibition are not promised security properties. See THREAT_MODEL.md for boundaries. Review and lock dependency versions, keep private artifacts outside hosting roots, verify the actual deployed URLs, and test your application's behavior before release. Publication and deployment require separate approval.
