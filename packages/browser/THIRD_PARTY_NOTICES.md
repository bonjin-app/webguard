# Third-party notices

WebGuard's original code is MIT licensed. Installed dependency versions are locked in `pnpm-lock.yaml`; licenses do not transfer ownership of third-party code. Distribute the applicable copyright notices with redistributed bundles.

The transformation engine is **javascript-obfuscator 5.9.0**, BSD-2-Clause, Copyright (c) 2016-2026 Timofei Kachalov. Its exact upstream license is included in `docs/licenses/javascript-obfuscator.txt`. The engine's browser build is bundled only into the Playground transformation worker. Protected applications do not require this engine at runtime.

Other runtime dependencies include Acorn (MIT), Commander (MIT), jiti (MIT), picomatch (MIT), and parse5 (MIT). React is MIT; Vite is MIT. An installed dependency license inventory is generated with `pnpm licenses list --prod --json`; inspect transitive notices before npm publication. The current audit and inventory are point-in-time preparation, not a guarantee about future dependency versions.
