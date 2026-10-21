# JSP + Jakarta Servlet example

Requires Java 17+, Maven and Tomcat 10.1+ (Jakarta Servlet 6). Server code is never sent through the obfuscator.

From the workspace root:

```sh
pnpm build
node scripts/prepare-jsp.mjs
cd examples/jsp-servlet
mvn package
# From the repository, optionally include Chromium/Firefox/WebKit checks:
mvn -Dwebguard.browser=true package
cd ../..
# Verify the packaged WAR too:
node scripts/verify-jsp-artifact.mjs
```

Deploy `target/webguard.war` to Tomcat, then open `/webguard/`. Test **Call Servlet** to exercise the real `/api/status` endpoint. The server Filter adds a restrictive CSP header; no inline SDK initialization is required. Serve over HTTPS in production. Set response headers on the server; a static SDK cannot enforce server authorization.

The preparation script applies Strict obfuscation to the built IIFE SDK and `assets-src/app.js`, verifies the final manifest, and copies only those two browser assets into the WAR's public `assets/` directory. It generates final-byte SRI tags in a private `WEB-INF/webguard-assets.jspf` include. Reports and manifests stay outside the public root; source maps are not included. JSP/Java code is unchanged by the JavaScript transform.

`WebGuardFilter` applies CSP, MIME protection and no-store caching to HTML, assets, API and missing paths. Its public-path allowlist is specific to this tiny example: adapt routes and reconcile the CSP with your existing application before integration. Do not install the sample's route allowlist unchanged on a larger service. The JSP renders a per-request server timestamp; the browser SDK intercepts page-delivered inspection shortcuts, and the app calls the real Servlet API. It does not close browser-owned developer tools.

The Maven tests compile the real JSP and start embedded Tomcat 10.1.61 on loopback. With `-Dwebguard.browser=true`, the repository's installed Playwright engines also execute the protected app, call the Servlet and verify trusted page-level shortcut handling. This is local Java/server and desktop-engine evidence, not physical mobile or production-container validation. [한국어 환경별 적용](../../docs/ENVIRONMENTS.ko.md).
