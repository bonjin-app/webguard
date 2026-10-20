import { WebGuard } from "@webguard/browser";
import { runIsolated, type RunResult } from "./sandbox";
import { examples, integrations } from "./examples";
import "./style.css";
let selectedExample: (typeof examples)[number] = examples[0];
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header><a class="brand" href="/" aria-label="WebGuard Playground"><span class="logo">W</span>WebGuard<span class="badge">PLAYGROUND</span></a><a class="docs-link" href="/docs/">Documentation ↗</a></header>
<main><div class="intro"><div><div class="eyebrow">BUILD-TIME PROTECTION, MADE VISIBLE</div><h1>Your code. A little harder to read.</h1><p>Protect JavaScript and compare the result. Everything happens in your browser.</p></div><span class="local"><span></span> Local processing</span></div>
<nav class="demo-nav" aria-label="체험 안내"><a href="#try-examples">난독화 예제</a><a href="#app-examples">보호된 웹앱</a><a href="#live-demo">실시간 SDK 체험</a><a href="#setup">내 프로젝트에 적용</a></nav>
<section id="try-examples" class="demo-section" aria-labelledby="try-heading"><div class="section-heading"><div><h2 id="try-heading">예제로 바로 시작하세요</h2><p>원클릭으로 High 난독화와 실제 실행 결과를 비교합니다. 코드는 이 브라우저에서만 처리합니다.</p></div><span class="badge">READY TO RUN</span></div><div class="sample-grid">${examples.map((item) => `<article class="sample-card"><h3>${item.title}</h3><p>${item.description}</p><p class="expected">예상 결과<br><code>${item.expected}</code></p><button class="sample-run" data-example="${item.id}">${item.title} 예제 실행</button></article>`).join("")}</div></section>
<section class="toolbar" aria-label="Protection controls"><div class="presets" role="group" aria-label="Protection preset"><button data-preset="basic" aria-pressed="false">Basic</button><button data-preset="standard" aria-pressed="true">Standard</button><button data-preset="high" aria-pressed="false">High</button></div><p id="preset-description">Balanced string protection for everyday builds.</p><button id="protect" class="primary">Protect & compare <span aria-hidden="true">↗</span></button></section>
<div id="status" role="status" aria-live="polite">Ready when you are. Start with the example or paste plain JavaScript.</div>
<section class="editors"><div class="panel"><div class="panel-head"><h2><span class="dot"></span>Source JavaScript</h2><button id="reset" class="text-button">Reset example</button></div><label class="sr-only" for="source">Source JavaScript</label><textarea id="source" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea><div class="panel-foot"><span>JAVASCRIPT</span><span id="source-bytes"></span></div></div><div class="panel"><div class="panel-head"><h2><span class="dot teal"></span>Protected output</h2><button id="copy" class="text-button" disabled>Copy code</button></div><label class="sr-only" for="output">Protected JavaScript</label><textarea id="output" readonly spellcheck="false" placeholder="Your protected code will appear here."></textarea><div class="panel-foot"><span id="output-label">AWAITING TRANSFORM</span><span id="output-bytes">—</span></div></div></section>
<section class="metrics" aria-label="Measured comparison"><article><h2>Code size</h2><strong id="size-change">—</strong><p id="size-detail">UTF-8 bytes, before → after</p></article><article><h2>Execution time</h2><strong id="timing">—</strong><p>Source → protected · one run, not a benchmark</p></article><article><h2>Output comparison</h2><strong id="equivalence">Not run</strong><p>Captured console output and completion status</p></article></section>
<section class="results"><div><h2>Execution output <span class="badge">ISOLATED</span></h2><pre id="logs">// Console output appears after protection.</pre></div><div><h2>Local protection report</h2><pre id="report">No report yet.</pre></div></section>
<section id="app-examples" class="demo-section" aria-labelledby="apps-heading"><div class="section-heading"><div><h2 id="apps-heading">보호된 웹앱을 직접 써보세요</h2><p>난독화된 실제 빌드입니다. 폼·카운터·화면 이동·동적 모듈이 동작하는지 확인하세요.</p></div></div><div class="sample-grid"><article class="sample-card"><span class="badge">AUTOMATIC SDK · STRICT</span><h3>React + Vite</h3><p>SDK 자동 시작, 강한 난독화, 서버 헤더와 실시간 제어를 한 앱에서 체험합니다.</p><a class="demo-link" href="/examples/react/">React 데모 열기</a></article><article class="sample-card"><span class="badge">MANUAL SDK · STANDARD</span><h3>JavaScript</h3><p>SDK를 직접 연결한 예제입니다. 단축키 옵션을 켜고 입력·동적 로딩을 시험하세요.</p><a class="demo-link" href="/examples/vanilla-js/">JavaScript 데모 열기</a></article><article class="sample-card"><span class="badge">TYPESCRIPT · STANDARD</span><h3>TypeScript</h3><p>TypeScript를 빌드한 뒤 보호한 예제입니다. 실행 동작과 SDK 옵션을 확인하세요.</p><a class="demo-link" href="/examples/vanilla-ts/">TypeScript 데모 열기</a></article></div></section>
<section id="live-demo" class="advisory"><div><h2>실시간 SDK 체험 <span class="badge">ADVISORY</span></h2><p id="detection">Monitoring local browser signals. No signal observed.</p><p>옵션은 즉시 적용됩니다. 실제 F12는 입력창 밖의 본문을 클릭한 뒤 시험하세요. 브라우저 메뉴나 이미 열린 개발자도구는 잠그지 않습니다.</p></div><div class="toggles"><label><input id="shortcuts" type="checkbox"> Restrict F12 / inspect shortcuts</label><label><input id="context" type="checkbox"> Restrict context menu</label></div></section>
<section class="live-check"><div><button id="test-f12" class="sample-run">F12 시험 이벤트 실행</button><button id="test-menu" class="sample-run">우클릭 시험 이벤트 실행</button></div><p id="live-result" aria-live="polite">옵션을 바꾸고 시험 이벤트를 실행해 보세요.</p><p>이 버튼은 페이지 이벤트 처리를 시험합니다. 실제 개발자도구 창의 열림 여부를 확인하는 검사는 아닙니다.</p></section>
<section id="setup" class="demo-section" aria-labelledby="setup-heading"><div class="section-heading"><div><h2 id="setup-heading">확인했다면 내 프로젝트에 적용하세요</h2><p>npm으로 설치하고 Vite 설정 한 번으로 적용하세요. <a href="/docs/#install">한국어 설치 가이드</a>에서 서버 헤더와 실시간 설정도 확인할 수 있습니다.</p></div></div><pre><code>npm install --save-dev uulab-webguard@0.1.0</code></pre><div class="setup-tabs" role="group" aria-label="적용 코드 선택">${integrations.map((item, index) => `<button data-integration="${item.id}" aria-pressed="${index === 0}">${item.title}</button>`).join("")}</div><p id="setup-hint"></p><div class="code-panel"><pre><code id="setup-code"></code></pre><button id="copy-setup" class="sample-run">적용 코드 복사</button></div><p id="copy-setup-status" aria-live="polite"></p><details><summary>이 데모를 직접 실행하려면</summary><pre><code>pnpm install --frozen-lockfile
pnpm demo</code></pre><p>하나의 로컬 주소에서 Playground·세 가지 웹앱·문서를 제공합니다. JSP는 위 준비 명령으로 WAR를 만든 뒤 별도 Tomcat에서 실행하세요.</p></details></section>
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
source.value = selectedExample.source;
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
  source.value = selectedExample.source;
  markSource();
});
function selectPreset(value: string) {
  preset = value;
  for (const item of document.querySelectorAll<HTMLElement>("[data-preset]"))
    item.setAttribute("aria-pressed", String(item.dataset.preset === preset));
  element("preset-description").textContent =
    {
      basic: "Compact output with lower transformation overhead.",
      standard: "Balanced string protection for everyday builds.",
      high: "RC4 string encoding and stronger transforms; expect larger output.",
    }[preset] ?? "";
  if (transformed)
    element("status").textContent =
      "Preset changed. Protect again to refresh the comparison.";
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-preset]",
))
  button.addEventListener("click", () => selectPreset(button.dataset.preset!));
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-example]",
))
  button.addEventListener("click", () => {
    if (protect.disabled) return;
    selectedExample = examples.find(
      (item) => item.id === button.dataset.example,
    )!;
    source.value = selectedExample.source;
    selectPreset("high");
    markSource();
    protect.click();
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
    "[data-preset], [data-example]",
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
      "[data-preset], [data-example]",
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
const guard = WebGuard.init({
  devtools: { detect: true, response: "monitor" },
  onThreat: (event) => {
    element("detection").textContent =
      `Local advisory: ${event.type}. No data sent.`;
  },
});
function configureGuard() {
  guard.update({
    devtools: {
      blockShortcuts: element<HTMLInputElement>("shortcuts").checked,
      blockContextMenu: element<HTMLInputElement>("context").checked,
    },
  });
}
element("shortcuts").addEventListener("change", configureGuard);
element("context").addEventListener("change", configureGuard);
function tryEvent(event: Event, label: string) {
  document.dispatchEvent(event);
  element("live-result").textContent =
    `${label} 시험 이벤트: ${event.defaultPrevented ? "차단됨" : "허용됨"} · 현재 페이지에 즉시 적용`;
}
element("test-f12").addEventListener("click", () =>
  tryEvent(
    new KeyboardEvent("keydown", {
      key: "F12",
      bubbles: true,
      cancelable: true,
    }),
    "F12",
  ),
);
element("test-menu").addEventListener("click", () =>
  tryEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    "우클릭",
  ),
);
let currentIntegration: (typeof integrations)[number] = integrations[0];
function showIntegration() {
  element("setup-code").textContent = currentIntegration.code;
  element("setup-hint").textContent = currentIntegration.hint;
  element("copy-setup-status").textContent = "";
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-integration]",
  ))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.integration === currentIntegration.id),
    );
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-integration]",
))
  button.addEventListener("click", () => {
    currentIntegration = integrations.find(
      (item) => item.id === button.dataset.integration,
    )!;
    showIntegration();
  });
element("copy-setup").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentIntegration.code);
    element("copy-setup-status").textContent = "적용 코드를 복사했습니다.";
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element("setup-code"));
    selection?.removeAllRanges();
    selection?.addRange(range);
    element("copy-setup-status").textContent =
      "클립보드 권한이 없어 코드를 선택했습니다. 직접 복사해 주세요.";
  }
});
showIntegration();
window.addEventListener("pagehide", () => guard.destroy(), { once: true });
