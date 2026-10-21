# Strong obfuscation and security policy

WebGuard raises the cost of understanding and changing delivered code, and helps applications apply browser security controls. It does not make a page authoritative over its owner's browser. A user can run debugging-plane code, disable checks, modify local values and call APIs directly. A security boundary must still hold when the SDK is removed.

## Strong build protection

```ts
import { webguard } from "@webguard/vite-plugin";
export default { plugins: [webguard({ preset: "strict" })] };
```

Strict selects High transforms and RC4 string-array encoding by default. High increases control-flow flattening, covers eligible strings throughout the string array, splits strings and adds function wrappers/call transforms and numeric expressions. Module specifiers, public API properties, bundler filename placeholders and legal notices remain usable. Property renaming/dead-code injection remain separate explicit choices because unknown reflection contracts can break.

RC4 here is **reversible code obfuscation**, not cryptographic protection of secrets. Runtime decoders ship with the bundle. Import paths and other deliberately reserved values remain readable. Strings absent from plain bundle text are evidence of a transform, not proof that their values cannot be recovered.

Standard remains the compatible default. Use Strict for selected application bundles and measure your actual workload. The API allows explicitly overriding `stringArrayEncoding: 'none'` when integration or performance requires it. There are no debugger loops, automatic reloads or browser freezing mechanisms.

## Response headers

```sh
node packages/cli/dist/bin.js headers
node packages/cli/dist/bin.js headers --trusted-types report-only
node packages/cli/dist/bin.js headers --allow-connect-origin https://api.example.com
```

These print JSON. Apply the values as **HTTP response headers** in your server or CDN configuration; generating JSON or initializing the browser SDK does not deploy any policy.

```ts
import { createSecurityHeaders } from "@webguard/core";
const headers = createSecurityHeaders({
  trustedTypes: "enforce",
  allowedOrigins: { connect: ["https://api.example.com"] },
});
// Example: for each [name, value], set your framework's response header.
```

The generated policy starts with `default-src 'none'`, permits self-hosted resources explicitly and denies plugins, base URL changes and embedding. It includes `nosniff`, a restrictive referrer policy and frame protection. Origin allowlists accept only exact HTTP(S) DNS/IPv4 origins (same-origin IPv6 remains covered by `self`); wildcards, CSP tokens, credentials, paths, queries and fragments are not accepted. A compromised explicitly allowed origin remains a risk.

Trusted Types defaults to enforcement: HTML/script injection sinks reject raw strings where the browser supports the directives, and new policies are denied. This can break applications that use `innerHTML`, HTML parser helpers, script URL assignment or third-party widgets. Review those integrations first. `report-only` keeps ordinary CSP enforcement while observing Trusted Types violations locally; no reporting endpoint or remote collection is configured. `off` omits Trusted Types directives. Older browsers may ignore unsupported directives.

Apps needing inline scripts should use a correctly designed, per-response nonce or hash policy and integrate it with the server; this minimal generator intentionally does not offer `unsafe-inline` or `unsafe-eval`. It does not automatically configure HTTPS/HSTS, cookies, sessions, CORS or authorization. The Playground's isolated worker/frame policy is separate; do not apply an incompatible policy blindly.

## What the controls can stop

| Attempt                                                           | Relevant control                                           | Boundary                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Recover original source from published maps                       | Remove maps, mapping comments and development files        | Historical URLs and hosting rules still need deployment checks                     |
| Read ordinary internal strings from bundle text                   | High + reversible string encoding                          | Values remain observable at runtime                                                |
| Load an unapproved external script or run an inline HTML handler  | Server response CSP                                        | An allowed script/origin and browser-owned execution remain trusted by the browser |
| Feed raw HTML/script URLs to DOM injection sinks                  | Enforced Trusted Types where supported                     | Does not prevent all DOM manipulation or replace input handling                    |
| Paste code into one's own DevTools                                | Browser-owned execution                                    | A generic page SDK cannot reliably prohibit it                                     |
| Change `isAdmin`, amount, user ID or SDK state before an API call | Server-side session, authorization and business validation | Requires integration and testing in the actual service                             |

## Attack regression tests

Browser tests verify blocked inline event handlers, blocked unapproved script loads, Trusted Types sink rejection where supported, and normal Strict React forms/routing/lazy imports under the generated response policy. A separate test deliberately confirms that browser-controlled execution can still change local page state. This prevents a false claim of a console lock.

Actual service integration should test unauthorized access, cross-user object IDs, modified amounts/roles, replay and requests sent without the SDK. CSRF protection and HttpOnly cookies address specific session risks; they do not make an already authorized user unable to issue requests through their own console.

References: [OWASP frontend security](https://cheatsheetseries.owasp.org/cheatsheets/Web_Frontend_Security_Cheat_Sheet.html), [Trusted Types response directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/require-trusted-types-for).

## Bounded SDK resource verification

The unpublished SDK candidate now verifies only explicit HTTP(S) resources without URL userinfo. Relative URLs resolve against the page location rather than a mutable HTML base. Requests omit credentials and referrers, reject redirects and use no-store. Cookie/HTTP-authenticated assets are deliberately unsupported by this check. This is not an SSRF defense or a server proxy.

Integrity budgets default to 10 seconds across fetch/read/digest, 16 MiB of decoded stream bytes, and four concurrent requests per instance. Validated upper bounds are 120 seconds, 64 MiB, and 16 concurrent requests. No unbounded arrayBuffer fallback is used. Overflow/timeouts/network failures produce an error rather than a mismatch or successful protection. Lifecycle or budget changes abort pending work and reject stale results. A monotonic completion check prevents delayed timers from accepting late successes; JavaScript scheduling and noncancelable native digest work remain limits.

Browser policy snapshots use null-prototype data objects. Header policy inputs reject inherited fields, accessors, exotic/sparse origin arrays and unknown keys without invoking user getters. These controls avoid accidental prototype-pollution policy downgrades; they are not a sandbox against arbitrary running JavaScript or Proxy traps.

The low-level deployment verifier always checks the actual mount root, even without expectedHeaders. When a trusted index.html entry exists, its bytes must match the root response as well as its file URL. Build reports/control files remain local deployment inputs and must not be served by an arbitrary static host; use the protected server or equivalent deny rules.
