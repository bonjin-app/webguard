import "./style.css";
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header><a href="#overview" class="brand">◈ WebGuard <small>DOCS / 0.1</small></a><a href="http://localhost:4173">Open playground ↗</a></header>
<div class="layout"><nav aria-label="Documentation"><span>GET STARTED</span><a href="#overview">Overview</a><a href="#install">Install & build</a><a href="#presets">Presets</a><span>GUIDES</span><a href="#cli">CLI workflow</a><a href="#browser">Browser SDK</a><a href="#playground">Playground</a><a href="#limits">Security limits</a><a href="#source">Source & verification</a></nav><main>
<section id="overview"><div class="eyebrow">LOCAL-FIRST JAVASCRIPT PROTECTION</div><h1>Make inspection harder.<br>Keep your boundaries clear.</h1><p class="lead">WebGuard transforms built JavaScript, removes public source maps, and records integrity hashes. No service account or backend is required.</p><aside>Code delivered to a browser can still be read and changed. Keep credentials, authorization, and valuable server-side logic on your server.</aside></section>
<section id="install"><h2>Install & build</h2><p>This repository is a development workspace. These commands use its local packages; public npm publication is a separate release step.</p><pre><code>git clone &lt;your-webguard-repository&gt;
cd webguard
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @webguard/playground dev</code></pre><p>Requires Node.js 22.12+ and pnpm 11.10. Compile TypeScript and JSX with your existing build tool before protecting its JavaScript output. JSP server templates are outside the transformation boundary.</p></section>
<section id="presets"><h2>Choose a preset</h2><div class="cards"><article><h3>Basic</h3><p>Compact transformations with lower overhead. Start here for performance-sensitive applications.</p></article><article><h3>Standard <small>DEFAULT</small></h3><p>Balanced string transformations for everyday production builds. Measure your own code.</p></article><article><h3>Strict / High</h3><p>Stronger transforms can increase size and runtime cost. The Playground calls its local experimental option High.</p></article></div><p>Presets describe transformation policy. They are not security grades. Browser shortcut and context-menu restrictions are optional and default to off.</p></section>
<section id="cli"><h2>Keep a reproducible CLI workflow</h2><p>Run the local CLI from this repository. Use <code>--help</code> to inspect the exact options before processing your application.</p><pre><code>node packages/cli/dist/bin.js --help
node packages/cli/dist/bin.js init
node packages/cli/dist/bin.js scan dist
node packages/cli/dist/bin.js build --command 'pnpm exec vite build' --input dist
node packages/cli/dist/bin.js verify dist-protected
node packages/cli/dist/bin.js report dist-protected</code></pre><ol><li>Build application source into JavaScript.</li><li>Review the configuration, exclude vendor or incompatible code, and preserve the original output.</li><li>Transform into a separate protected output. Keep private source maps outside public output.</li><li>Verify the final integrity manifest and test the protected application.</li></ol><p>Transformation failures must fail the build. A hash of a final file detects a mismatch against a trusted expected hash; a freely replaceable manifest is not an authenticity guarantee.</p></section>
<section id="browser"><h2>Optional browser signals</h2><pre><code>import { WebGuard } from '@webguard/browser';

const guard = WebGuard.init({
  devtools: {
    detect: true,
    blockShortcuts: false,
    blockContextMenu: false,
    response: 'monitor',
  },
  onThreat(event) {
    console.info('Local advisory:', event.type);
  },
});

// On application teardown:
guard.destroy();</code></pre><p>Detection is an advisory signal with false positives and false negatives. Do not use it for authentication or authorization. Restricting keyboard shortcuts cannot prevent inspection and can interfere with accessibility. Events are local callbacks; telemetry is not automatically sent.</p></section>
<section id="playground"><h2>Try it without uploading code</h2><p>The <a href="http://localhost:4173">Playground</a> uses the browser build of javascript-obfuscator in a dedicated worker. It shows UTF-8 sizes, transformation time, and a single measured execution for source and protected code.</p><p>Input executes in a disposable worker inside an opaque-origin sandbox iframe. The frame cannot access the app origin. CSP blocks network requests. There is no DOM access, module loading, popup, form, or download capability. A one-second deadline terminates each execution; console output and input size are capped.</p><p>Use <code>console.log</code> to compare deterministic results. Matching captured output is useful evidence for the tested input, not proof of full behavioral equivalence. The Playground compares synchronous script completion; background asynchronous work after completion is not captured. Runtime timings include worker-side wrapping and are noisy single samples, not benchmarks.</p></section>
<section id="limits"><h2>Understand the limits</h2><ul><li>Obfuscation raises inspection effort; it does not encrypt code from its recipient.</li><li>Client-side integrity checks can be modified or bypassed by a client.</li><li>Dynamic imports, DOM behavior, timing, and third-party code require application-specific regression tests.</li><li>Worker isolation reduces accidental interference but is not a hostile-code containment service. Resource exhaustion and browser vulnerabilities remain outside its guarantees.</li><li>No infinite debugger loops, forced refreshes, freezing, or automatic analytics are used.</li></ul></section>
<section id="source"><h2>Source & verification</h2><p>The source workspace contains <code>packages/</code> for libraries, <code>examples/</code> for integrations, and <code>tests/</code> for unit and browser checks.</p><pre><code>pnpm verify
pnpm test:e2e
pnpm benchmark</code></pre><p>These are commands to run, not claims that every platform or environment has passed. Automated browsers are distinct from physical-device testing. Review the repository <code>README.md</code>, <code>THREAT_MODEL.md</code>, <code>SECURITY.md</code>, and <code>docs/reference/original-brief.ko.md</code> for the full boundary.</p><p>WebGuard is MIT licensed. Its transformation engine javascript-obfuscator 5.9.0 is BSD-2-Clause licensed. Retain required notices when distributing dependencies.</p><a href="https://github.com/javascript-obfuscator/javascript-obfuscator" rel="noreferrer">Transformation engine source ↗</a></section>
<footer>WebGuard · Build-time protection, honest boundaries.</footer></main></div>`;
