# One build setting and live SDK controls

For the public npm facade, install `uulab-webguard@0.1.0` and follow [the Korean guide](INSTALL.ko.md). Its root, `/client`, `/browser` and `/headers` exports bundle the internal packages. The commands below document development inside this repository's workspace.

The opt-in `webguardApp()` Vite integration bundles Strict/High obfuscation, automatic browser SDK startup, source-map removal, SRI/manifests and deployment header artifacts. It targets Vite browser applications with HTML/module entries, not SSR/library builds. Existing `webguard()` keeps its compatible build-only behavior.

## Package and build configuration

Only `@webguard/vite-plugin` is a direct application dependency for protection; its SDK dependency is supplied transitively. These are unpublished local workspace packages with temporary names. Do not install an unrelated public registry package. Run the checked-in React example now, or link the package in a consuming pnpm workspace:

```sh
# In a workspace that includes WebGuard packages and your app:
pnpm --filter YOUR_APP add -D @webguard/vite-plugin@workspace:*
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { webguardApp } from "@webguard/vite-plugin";

export default defineConfig({
  plugins: [
    webguardApp({
      runtime: {
        devtools: {
          blockShortcuts: true,
          blockContextMenu: true,
        },
      },
    }),
  ],
});
```

No SDK import or initialization is required in the application entry. `webguardApp()` defaults to Strict/High + reversible RC4 string encoding and an SDK with resize-based advisory detection. Intrusive shortcut/context-menu interception defaults to **off**; the explicit `true` values above enable it for the protected production build. Standard remains available with `preset: 'standard'` when performance calls for it. Strong protection has a size/runtime cost; see the recorded benchmarks.

Vite development/HMR stays unrestricted. Build the app using its normal build command. The injected bootstrap executes before the ordinary HTML module application entry; it cannot intercept events before JavaScript starts, nor reorder existing parser-blocking classic scripts into module execution order.

The packed consumer check installs only this protection package (plus Vite) as a direct dependency in an unrelated temporary app, then builds and executes its automatic SDK/client entry. It uses local tarball overrides for internal package names because nothing is published:

```sh
pnpm build
pnpm test:package
```

The check is offline after a normal workspace install has populated the pnpm cache; temporary packages are deleted afterward.

## Enable or disable instantly

Application code can import the browser-safe client entry from the same package:

```ts
import { getWebGuard } from "@webguard/vite-plugin/client";

// Immediate change on this page. No rebuild, reload, reinstallation or polling.
getWebGuard()?.update({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});

// Later, for example in an authorized UI setting or route handler:
getWebGuard()?.update({ devtools: { blockShortcuts: false } });

// Attach local diagnostics in application code; callbacks cannot be serialized in build config.
getWebGuard()?.update({ onThreat: (event) => console.info(event.type) });
const options = getWebGuard()?.getOptions();
```

Nested updates preserve fields you did not change and validate before applying. A snapshot is detached from internal state. Updates to a destroyed instance do not resurrect it. No automatic remote settings service, persistence, telemetry or recurring fetch is installed. Reloading starts again from build configuration. `getWebGuard()` returns `undefined` in SSR, development without automatic injection, before bootstrap, or after the automatic guard is destroyed.

The standalone SDK has the same live API: `WebGuard.init(...).update(...)`. F12 and common Ctrl+Shift+I/J/C or Cmd+Option+I/J/C combinations can be intercepted when events reach the page. Restrictions skip inputs, textareas, selects and editable content (including focused checkboxes). Click ordinary page content when testing F12. Browser menus, already-open developer tools, remote debugging and browser-owned console execution remain available. These controls are friction, not authorization.

## Server headers

Each protected build emits:

- `webguard-headers.json`: response header values for your server.
- `_headers`: a ready-to-use static host header file.
- Existing integrity manifest/report files. Root deployment header files are excluded from the resource manifest; keep the local policies trusted and protect them through deployment. Nested files with the same names remain ordinary hashed payload.

The generator does not remotely configure a CDN or mutate an existing host. It refuses to replace a public header file, retained output policy (when Vite does not empty its output), or a header asset already emitted by another integration. Header generation runs late in bundling to detect normal host-plugin conflicts. To retain your current server policy, choose `headers: false` and integrate deliberately. `runtime: false` disables automatic SDK injection while keeping build protection.

The [Node HTTP example](../examples/security-server/README.md) actually applies the JSON to its responses:

```sh
pnpm --filter @webguard/example-react-vite build
node examples/security-server/server.mjs examples/react-vite/dist --port 4174
```

Open `http://127.0.0.1:4174` and try the two live controls. Inspect response headers to confirm server application. The example uses plain loopback HTTP for local validation; a deployed service must integrate its own hosting, TLS, sessions and authorization.

For a static Netlify deployment, keep the generated `_headers` in the published output. Netlify applies that file to its static backing-store responses; proxied/function/SSR responses must return headers themselves. [Official header-file documentation](https://docs.netlify.com/manage/routing/headers/). Deployment itself has not been performed by this task.

Trusted Types defaults to enforcement and can break apps/widgets that use raw-string DOM sinks. Start with `headers: { trustedTypes: 'report-only' }` when checking those integrations; `off` omits those directives. Extra origins use `headers.allowedOrigins`, with exact HTTP(S) DNS/IPv4 origins. The base CSP still blocks inline scripts and unapproved resource origins in report-only mode. See [security policy details](SECURITY_HARDENING.md).
