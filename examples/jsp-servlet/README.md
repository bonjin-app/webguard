# JSP + Jakarta Servlet example

Requires Java 17+, Maven and Tomcat 10.1+ (Jakarta Servlet 6). Server code is never sent through the obfuscator.

From the workspace root:

```sh
pnpm build
node scripts/prepare-jsp.mjs
cd examples/jsp-servlet
mvn package
```

Deploy `target/webguard.war` to Tomcat, then open `/webguard/`. Test **Call Servlet** to exercise the real `/api/status` endpoint. The JSP adds a restrictive CSP header; no inline SDK initialization is required. Serve over HTTPS in production. Set response headers on the server; a static SDK cannot enforce server authorization.

The preparation script copies the built IIFE SDK into a temporary staging tree, protects `assets-src/app.js`, verifies its manifest, then copies the protected public assets into the WAR's `assets/` directory. Do not include private maps in the WAR. Java/Maven/container and physical mobile browser validation are reported separately from JavaScript tests.
