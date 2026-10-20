# Architecture

`shared` defines callback event types. `core` resolves and validates isolated policy values. `obfuscator` applies an AST engine to already-built JavaScript and strips mapping comments using Acorn token positions, preserving strings. The engine's Node API is asynchronous for composition, but transformation itself is CPU-bound.

`browser` is a small runtime with optional shortcut friction, event-driven window-dimension hints, explicit resource hashing and cleanup. It never decides authorization or silently reports telemetry.

`integrity` inventories raw file bytes in sorted path order and computes SHA-384 SRI records. Verification rejects unsafe paths, symlinks, changed, missing and unexpected assets. Root report/manifest files are explicitly excluded to avoid metadata self-reference.

`cli` validates input/output separation, checks original assets for possible credentials, stages output beside the destination, removes development files and maps, transforms selected JavaScript, strips CSS mapping comments, updates HTML SRI, generates a report and final manifest, then renames the completed directory. It refuses an existing destination. Private maps use a separate staged directory. Failure removes newly created stages; original files are not changed.

`vite-plugin` uses `renderChunk` so Vite calculates filenames after protection. A final build hook runs the common sanitation and integrity pipeline without re-obfuscating chunks; final output replaces only that build's output. Library/SSR/in-memory builds are rejected. Other build tools use the CLI; dedicated adapters are deferred.

`playground` has three trust boundaries: a main UI, a local transformation worker containing the engine, and a disposable opaque-origin frame which owns an execution worker. A restrictive frame CSP blocks network/data access. Channels and per-run tokens bind messages. A timer outside user code terminates a long-running worker and removes the frame. This limits routine mistakes but does not provide process/resource isolation against a hostile multi-tenant workload.

Build graph: shared → core/obfuscator → CLI → Vite → examples, with browser and integrity independently reusable. Packages emit ESM plus TypeScript declarations; browser additionally emits a self-contained IIFE. CJS is omitted because no initial consumer requires it.
