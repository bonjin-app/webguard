import { WebGuard } from "@webguard/browser";
import { runIsolated, type RunResult } from "./sandbox";
import "./style.css";
const sample = `// A small, deterministic example. Your code stays in this browser.
const prices = [19, 24, 12, 35];
const total = prices.reduce((sum, price) => sum + price, 0);
console.log('Order total:', total);
console.log('With delivery:', total + 5);`;
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header><a class="brand" href="/" aria-label="WebGuard Playground"><span class="logo">W</span>WebGuard<span class="badge">PLAYGROUND</span></a><a class="docs-link" href="http://localhost:4175">Documentation ↗</a></header>
<main><div class="intro"><div><div class="eyebrow">BUILD-TIME PROTECTION, MADE VISIBLE</div><h1>Your code. A little harder to read.</h1><p>Protect JavaScript and compare the result. Everything happens in your browser.</p></div><span class="local"><span></span> Local processing</span></div>
<section class="toolbar" aria-label="Protection controls"><div class="presets" role="group" aria-label="Protection preset"><button data-preset="basic" aria-pressed="false">Basic</button><button data-preset="standard" aria-pressed="true">Standard</button><button data-preset="high" aria-pressed="false">High</button></div><p id="preset-description">Balanced string protection for everyday builds.</p><button id="protect" class="primary">Protect & compare <span aria-hidden="true">↗</span></button></section>
<div id="status" role="status" aria-live="polite">Ready when you are. Start with the example or paste plain JavaScript.</div>
<section class="editors"><div class="panel"><div class="panel-head"><h2><span class="dot"></span>Source JavaScript</h2><button id="reset" class="text-button">Reset example</button></div><label class="sr-only" for="source">Source JavaScript</label><textarea id="source" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea><div class="panel-foot"><span>JAVASCRIPT</span><span id="source-bytes"></span></div></div><div class="panel"><div class="panel-head"><h2><span class="dot teal"></span>Protected output</h2><button id="copy" class="text-button" disabled>Copy code</button></div><label class="sr-only" for="output">Protected JavaScript</label><textarea id="output" readonly spellcheck="false" placeholder="Your protected code will appear here."></textarea><div class="panel-foot"><span id="output-label">AWAITING TRANSFORM</span><span id="output-bytes">—</span></div></div></section>
<section class="metrics" aria-label="Measured comparison"><article><h2>Code size</h2><strong id="size-change">—</strong><p id="size-detail">UTF-8 bytes, before → after</p></article><article><h2>Execution time</h2><strong id="timing">—</strong><p>Source → protected · one run, not a benchmark</p></article><article><h2>Output comparison</h2><strong id="equivalence">Not run</strong><p>Captured console output and completion status</p></article></section>
<section class="results"><div><h2>Execution output <span class="badge">ISOLATED</span></h2><pre id="logs">// Console output appears after protection.</pre></div><div><h2>Local protection report</h2><pre id="report">No report yet.</pre></div></section>
<section class="advisory"><div><h2>Browser signals <span class="badge">ADVISORY</span></h2><p id="detection">Monitoring local browser signals. No signal observed.</p><p>Signals can be inaccurate. They do not establish security or control access.</p></div><div class="toggles"><label><input id="shortcuts" type="checkbox"> Restrict F12 / inspect shortcuts</label><label><input id="context" type="checkbox"> Restrict context menu</label></div></section>
<footer><strong>Protection has limits.</strong> Delivered JavaScript can still be inspected and modified. Keep secrets and authorization on your server. Execution supports console-based JavaScript, without DOM access; imports and network requests are blocked. Workers are stopped after 1 second. This is a testing aid, not a hostile-code containment service.</footer></main>`;
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const source = element<HTMLTextAreaElement>("source");
const output = element<HTMLTextAreaElement>("output");
const protect = element<HTMLButtonElement>("protect");
const copy = element<HTMLButtonElement>("copy");
let preset = "standard";
let transformed = false;
const bytes = (code: string) => new TextEncoder().encode(code).length;
const formatBytes = (size: number) => `${size.toLocaleString()} B`;
source.value = sample;
function markSource() {
  element("source-bytes").textContent = formatBytes(bytes(source.value));
  if (transformed) {
    element("status").textContent =
      "Source changed. Protect again to refresh the comparison.";
    element("equivalence").textContent = "Out of date";
  }
}
source.addEventListener("input", markSource);
markSource();
element("reset").addEventListener("click", () => {
  source.value = sample;
  markSource();
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-preset]",
))
  button.addEventListener("click", () => {
    preset = button.dataset.preset!;
    for (const item of document.querySelectorAll("[data-preset]"))
      item.setAttribute("aria-pressed", String(item === button));
    element("preset-description").textContent =
      {
        basic: "Compact output with lower transformation overhead.",
        standard: "Balanced string protection for everyday builds.",
        high: "Additional control-flow transforms; expect larger output.",
      }[preset] ?? "";
    if (transformed)
      element("status").textContent =
        "Preset changed. Protect again to refresh the comparison.";
  });
function transform(code: string): Promise<{ code: string; elapsed: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./transform.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
      window.removeEventListener("pagehide", finish);
    };
    window.addEventListener("pagehide", finish, { once: true });
    const timer = setTimeout(() => {
      finish();
      reject(
        new Error(
          "Transformation timed out (15 seconds). Try a smaller input.",
        ),
      );
    }, 15000);
    worker.onmessage = (
      event: MessageEvent<{ code: string; elapsed: number; error?: string }>,
    ) => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.onerror = (event) => {
      finish();
      reject(
        new Error(
          `Transformation worker failed: ${event.message || "could not load engine"}`,
        ),
      );
    };
    worker.postMessage({ code, preset });
  });
}
function describe(result: RunResult) {
  return `${result.logs.join("\n") || "(no console output)"}${result.error ? `\nError: ${result.error}` : ""}`;
}
protect.addEventListener("click", async () => {
  const input = source.value;
  if (!input.trim() || bytes(input) > 100000) {
    element("status").textContent =
      "Enter JavaScript between 1 and 100,000 bytes.";
    return;
  }
  protect.disabled = true;
  element<HTMLButtonElement>("reset").disabled = true;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-preset]",
  ))
    button.disabled = true;
  element("size-change").textContent = "—";
  element("timing").textContent = "—";
  element("output-bytes").textContent = "—";
  element("output-label").textContent = "TRANSFORMING";
  element("report").textContent = "Preparing local report…";
  source.disabled = true;
  copy.disabled = true;
  output.value = "";
  transformed = false;
  element("equivalence").textContent = "Running…";
  element("status").textContent = "Protecting locally…";
  try {
    const result = await transform(input);
    output.value = result.code;
    copy.disabled = false;
    element("status").textContent = "Comparing execution in isolated workers…";
    const original = await runIsolated(input);
    const protectedRun = await runIsolated(result.code);
    const originalBytes = bytes(input);
    const protectedBytes = bytes(result.code);
    const delta = ((protectedBytes - originalBytes) / originalBytes) * 100;
    element("source-bytes").textContent = formatBytes(originalBytes);
    element("output-bytes").textContent = formatBytes(protectedBytes);
    element("output-label").textContent =
      `${preset.toUpperCase()} · ${result.elapsed.toFixed(1)} MS TRANSFORM`;
    element("size-change").textContent =
      `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
    element("size-detail").textContent =
      `${formatBytes(originalBytes)} → ${formatBytes(protectedBytes)}`;
    element("timing").textContent =
      `${original.elapsed.toFixed(2)} → ${protectedRun.elapsed.toFixed(2)} ms`;
    const failed = original.error || protectedRun.error;
    const equal =
      JSON.stringify(original.logs) === JSON.stringify(protectedRun.logs);
    element("equivalence").textContent = failed
      ? "Execution error"
      : equal
        ? "Outputs match"
        : "Outputs differ";
    element("logs").textContent =
      `SOURCE\n${describe(original)}\n\nPROTECTED\n${describe(protectedRun)}`;
    const digest = async (code: string) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)),
        ),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
    const expected = await digest(result.code);
    const readback = await digest(output.value);
    element("report").textContent =
      `Preset: ${preset}\nTransform: ${result.elapsed.toFixed(1)} ms\nOutput SHA-256: ${expected}\nLocal output readback: ${expected === readback ? "hash matches" : "hash mismatch"}\nSource maps: disabled\nExecution: ${failed ? "error" : equal ? "captured outputs match" : "captured outputs differ"}\nThis hash checks local output consistency, not authenticity.`;
    element("status").textContent = failed
      ? "Protection completed. Execution reported an error; inspect the output below."
      : "Protection complete. Measurements and local report are ready.";
    transformed = true;
  } catch (error) {
    element("status").textContent =
      `Protection failed: ${error instanceof Error ? error.message : String(error)}`;
    element("equivalence").textContent = "Not run";
    element("logs").textContent =
      "Execution skipped because protection failed.";
    element("report").textContent = "No completed report.";
  } finally {
    protect.disabled = false;
    element<HTMLButtonElement>("reset").disabled = false;
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "[data-preset]",
    ))
      button.disabled = false;
    source.disabled = false;
  }
});
copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    copy.textContent = "Copied";
    setTimeout(() => {
      copy.textContent = "Copy code";
    }, 1500);
  } catch {
    element("status").textContent =
      "Clipboard unavailable. Select and copy the protected output manually.";
  }
});
let guard: ReturnType<typeof WebGuard.init>;
function configureGuard() {
  guard?.destroy();
  guard = WebGuard.init({
    devtools: {
      detect: true,
      blockShortcuts: element<HTMLInputElement>("shortcuts").checked,
      blockContextMenu: element<HTMLInputElement>("context").checked,
      response: "monitor",
    },
    onThreat: (event) => {
      element("detection").textContent =
        `Local advisory: ${event.type}. No data sent.`;
    },
  });
}
element("shortcuts").addEventListener("change", configureGuard);
element("context").addEventListener("change", configureGuard);
configureGuard();
window.addEventListener("pagehide", () => guard.destroy(), { once: true });
