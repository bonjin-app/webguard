# Try WebGuard with examples

Open the **[public demo](https://webguard-demo.uulab.workers.dev)** to try the examples without installing anything. [Public deployment details](PUBLIC_DEMO.md).

From the repository root, install dependencies and start the complete local demo:

```sh
pnpm install --frozen-lockfile
pnpm demo
```

Open `http://127.0.0.1:4173`. No account, API key or Java installation is needed for the browser demos. The command builds the packages and applications, assembles `.demo-dist`, and serves all examples through one loopback server. The first build takes longer than later cached package builds.

## What to try

| Example          | Action                                               | Observable result                                                                   |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Cart calculation | Click 장바구니 계산 예제 실행                        | High protection, then totals 90 and 95 from both versions                           |
| Form validation  | Click 폼 검증 예제 실행                              | String/regexp/condition behavior preserved; valid true, invalid false               |
| Data aggregation | Click 데이터 집계 예제 실행                          | Array/object and Korean-string behavior preserved; 서울 5, 부산 4                   |
| Live SDK         | Toggle F12/context-menu options and run trial events | Immediate allowed/blocked feedback; no reload                                       |
| React + Vite     | Open `/examples/react/`                              | Automatic SDK startup, Strict transforms, live controls, forms/routing/lazy modules |
| JavaScript       | Open `/examples/vanilla-js/`                         | Manually connected SDK, Standard protection, counter/forms/lazy module              |
| TypeScript       | Open `/examples/vanilla-ts/`                         | Compiled TypeScript, Standard protection with Base64, same application interactions |
| Documentation    | Open `/docs/`                                        | Integration guidance on the same origin                                             |

The three code snippets execute through the existing isolated console harness. Their expected outputs are shown separately from actual captured output. No comparison result is prefilled. The live trial buttons dispatch page test events, not real developer-tool window controls. To try an actual key, enable the option, click ordinary page content outside an input and press F12. Browser-owned execution and menus remain available.

## Take the integration into your app

The Playground includes selectable, copyable Vite setup, live update, Node server and JSP/Servlet preparation snippets. Clipboard failure selects the code for manual copying. Read [one-setting setup](ONE_STEP_SETUP.md) for supported application builds, opt-outs and compatibility details.

The packages are unpublished local workspace packages with temporary names. Examples use workspace links; do not install an unrelated registry package expecting this code. The public demo does not require npm package publication.

JSP/Servlet needs Java 17, Maven and Tomcat 10.1+. The in-page JSP tab shows the asset-preparation and WAR build commands. See [the JSP example](../examples/jsp-servlet/README.md); its server cannot run inside the browser sandbox.

## Server policies and routes

The gateway keeps each application in a separate filesystem root and strips only its known route prefix. React/JS/TS receive their generated restrictive CSP and Trusted Types response headers. Playground and docs have their own minimal policy: they use raw-string UI rendering, and the Playground's isolated frame/worker has a separate execution policy. They do not claim the examples' Trusted Types enforcement. A single origin is convenient for demos and is not a hostile-tenant isolation boundary.

The prepared bundle is `.demo-dist` with `playground`, `docs`, `react`, `vanilla-js`, and `vanilla-ts` subdirectories. To start an already-built demo on another port:

```sh
node scripts/demo-server.mjs --port 4180
```

The default server binds to `127.0.0.1`. It is for local evaluation; public hosting, TLS and production operations are separate work. The standalone `pnpm dev` runs only the transformation UI; use `pnpm demo` for the complete example routes.

## Verify

```sh
pnpm verify
pnpm test:e2e
```

The browser test command prepares the demo first, then runs Chromium/Firefox/WebKit checks for real sample output, live control changes, same-origin example navigation and existing protection/sandbox regressions. Local checks are distinct from external deployment, physical-device evidence and remote CI.
