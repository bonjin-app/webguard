# Static server with generated response headers

After building an application configured with `webguardApp()` and its default header generation, run from the repository root:

```sh
node examples/security-server/server.mjs examples/react-vite/dist --port 4174
```

Open http://127.0.0.1:4174. The server uses Node's standard library and binds only to loopback. No install or account is needed. The default port is 4174.

The server reads the build's trusted local `webguard-headers.json` once before startup. Missing files, invalid JSON, invalid header names or values, duplicate names, HTTP framing headers, and policies without `Content-Security-Policy` prevent startup. The policy is applied to HTML, assets, and error responses. `X-Content-Type-Options: nosniff` and MIME types are supplied by the server. The generated `_headers` file is intended for hosts that support that format; it is not parsed here.

`GET` and `HEAD` are supported. `/` serves `index.html`; other paths must name an existing file. There are no directory listings or SPA route fallbacks. Dot paths, source maps, common source/development files and directories, configuration files, and header-policy artifacts are not served. Encoded traversal and symlinks outside the canonical build directory are rejected, including symlinks disguising blocked source files inside it. The example also rejects backslashes and nested percent encodings.

Use a trusted, immutable build directory and restart after replacing it or changing the header policy. This is a small deployment example, not a general-purpose production server: it buffers files in memory and does not provide TLS, authentication, authorization, rate limiting, or a complete sensitive-file inventory. Keep secrets and server-only files out of every public build. CSP and obfuscation do not make browser-delivered data secret.

For tests or another local launcher, `await createProtectedServer(directory)` returns a Node `http.Server` that is not yet listening. Call `server.listen()` yourself and close it when finished.
