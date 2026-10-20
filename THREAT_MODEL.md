# Threat model

## Assets and trust boundaries

Protect original source maps, development sources, private configuration, deployable behavior and file integrity. The browser and all user-visible resources are controlled by the user. Trusted build machines, local config files and deployment controls are outside that browser boundary.

## Controls

- AST obfuscation raises analysis cost but preserves execution and does not encrypt secrets.
- Source-map removal prevents the selected output from shipping original maps. Private artifacts must also remain outside the actual hosting/CDN document root.
- Credential scanning is heuristic, redacts matched values and fails protection on detected risks before and after transforms.
- CLI rejects overlapping destinations and symlinks and stages work before publication. It assumes a local filesystem not concurrently controlled by an adversary; it is not an OS sandbox.
- SRI/CSP strengthen resource loading when served correctly. A trusted local manifest anchors deployment verification. Same-channel mutable manifests do not authenticate themselves.
- Browser callbacks indicate uncertain hints. Disabling the SDK, using browser menus, modifying JavaScript, or inspecting network responses bypasses client-only friction.
- Playground execution has no same-origin privilege, DOM or network access. Output size and runtime limits reduce accidental abuse, not all memory exhaustion or browser-engine attacks.

## Out of scope

Absolute source secrecy; DRM; XSS/WAF replacement; bot prevention; malicious browser extensions; remote-debugging prevention; server authorization; secrets sent to the client; protection of Java/JSP server code; full source-map inventory of historical deployments; physical-device/browser coverage not actually tested.

Keep licensing, payment, account access and privilege checks on a trusted server. Do not use devtools detection to punish, lock out or automatically navigate ordinary users. Follow [OWASP frontend guidance](https://cheatsheetseries.owasp.org/cheatsheets/Web_Frontend_Security_Cheat_Sheet.html).
