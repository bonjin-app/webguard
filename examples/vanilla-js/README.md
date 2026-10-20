# Vanilla JS example

From the repository root:

```sh
pnpm install
pnpm build
pnpm --filter @webguard/example-vanilla-js preview
```

Open http://127.0.0.1:4176. The production Vite plugin protects built JavaScript and writes an integrity manifest and report in `dist`. Source maps are disabled by default. `pnpm --filter @webguard/example-vanilla-js dev` starts the unprotected development server.

Try the counter, dynamically loaded module, and message form. The form renders text using `textContent`. Enable “Block developer shortcuts” explicitly to exercise the browser SDK; turn it off to remove the previous guard listeners. No telemetry is sent.

The page uses a Content Security Policy without `unsafe-eval` or inline scripts. Obfuscation is not encryption, and browser shortcut interception cannot disable developer tools or enforce authorization.

## Complete demo

Run `pnpm demo` from the repository root and open `http://127.0.0.1:4173/examples/vanilla-js/`. The gateway applies the generated CSP/Trusted Types response headers. This JavaScript example shows manual SDK connection; the React example shows automatic connection with `webguardApp()`. See [the demo walkthrough](../../docs/DEMO_GUIDE.md).
