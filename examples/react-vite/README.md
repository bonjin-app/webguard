# React + Vite example

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm demo
```

Open `http://127.0.0.1:4173/examples/react/`. The full demo serves the protected app and generated CSP/Trusted Types from one origin.

`webguardApp()` automatically starts the SDK before React renders and applies Strict protection. Try the counter, form, hash routing, lazy module and the two live shortcut/context-menu controls. `getWebGuard().update(...)` changes policy without a reload; no manual `WebGuard.init()` is needed.

To run only this app with its real response headers, build it with `pnpm --filter @webguard/example-react-vite build`, then run `node examples/security-server/server.mjs examples/react-vite/dist --port 4174`. A bare Vite preview does not apply the generated server policy. Development intentionally stays unrestricted. See [the setup guide](../../docs/ONE_STEP_SETUP.md).
