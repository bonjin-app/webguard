# Architecture

`shared` defines callback event types. `core` resolves and validates isolated policy values. `obfuscator` applies an AST engine to already-built JavaScript and strips mapping comments using Acorn token positions, preserving strings. The engine's Node API is asynchronous for composition, but transformation itself is CPU-bound.

`browser` is a small runtime with optional shortcut friction, event-driven window-dimension hints, explicit resource hashing and cleanup. It never decides authorization or silently reports telemetry.

`integrity` inventories raw file bytes in sorted path order and computes SHA-384 SRI records. Verification rejects unsafe paths, symlinks, changed, missing and unexpected assets. Root report/manifest files are explicitly excluded to avoid metadata self-reference.

`cli` validates input/output separation, checks original assets for possible credentials, stages output beside the destination, removes development files and maps, transforms selected JavaScript, strips CSS mapping comments, updates HTML SRI, generates a report and final manifest, then renames the completed directory. It refuses an existing destination. Private maps use a separate staged directory. Failure removes newly created stages; original files are not changed.

`vite-plugin` uses `renderChunk` so Vite calculates filenames after protection. A final build hook runs the common sanitation and integrity pipeline without re-obfuscating chunks; final output replaces only that build's output. Library/SSR/in-memory builds are rejected. Other build tools use the generic application-protection API or CLI. This is a final-output integration rather than a native Webpack/esbuild/framework plugin.

`playground` has three trust boundaries: a main UI, a local transformation worker containing the engine, and a disposable opaque-origin frame which owns an execution worker. A restrictive frame CSP blocks network/data access. Channels and per-run tokens bind messages. A timer outside user code terminates a long-running worker and removes the frame. This limits routine mistakes but does not provide process/resource isolation against a hostile multi-tenant workload.

Build graph: shared → core/obfuscator → CLI → Vite → examples, with browser and integrity independently reusable. Packages emit ESM plus TypeScript declarations; browser additionally emits a self-contained IIFE. CJS is omitted because no initial consumer requires it.

`application` composes the common transactional filesystem pipeline for static applications. Its factory receives a standalone browser-runtime resolver, keeping installed-package paths separate from internal workspace paths. It validates input/output boundaries, stages external runtime and policy injection into real static HTML, then protects final assets and generates SRI/manifest data before publication. Existing CSP and unsupported inline execution must be handled explicitly. Server templates are not passed through the obfuscator.

The public facade separates `uulab-webguard/build` (generic Node build APIs), the `webguard protect-app` CLI, `uulab-webguard/browser.global.js` (explicit-start classic SDK), browser ESM, Vite integration, policy generation, serving and deployment verification. Vite is an optional peer; importing `/build` must not resolve Vite. Auto-generated generic runtime exposes its existing instance through `WebGuardSDK.getAutoGuard()`, while Vite uses its browser client helper. Standalone SDK loading alone has no startup side effect.

Webpack, esbuild and plain HTML consumers exercise the same generic pipeline. Server-template recipes demonstrate static-asset/runtime/header boundaries, not executed PHP/ASP.NET/Nginx/Tomcat deployments. Native SSR, middleware, nonce, hydration and framework-specific hash/precache contracts remain outside the automatic integration.

Generic postprocessing retains existing toolchain filenames; content hashes embedded by a prior build do not necessarily identify protected bytes. Random seeds or engine-version changes can produce different bytes at the same URL. Deployments must use release-specific paths or cache revalidation/no-store unless a later build step rewrites final filenames and all references/manifests. The common pipeline does not claim final-content filename regeneration.
