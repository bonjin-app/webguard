import { getAutoGuard, installAutoGuard } from "@webguard/browser";
import { siteGuardOptions } from "../../site-guard-options";
import { runIsolated, type RunResult } from "./sandbox";
import { examples, integrations } from "./examples";
import "./style.css";
import "./sky.css";
import { initDemoNavigation } from "./navigation";
import { productStoryMarkup, productFaqMarkup } from "./product-story";
import {
  protectionOverviewMarkup,
  initProtectionOverview,
} from "./protection-overview";
import { labMarkup, initLab } from "./lab";
import { resourceMarkup, initResources } from "./resource-demo";
import { policyMarkup, initPolicyDemo } from "./policy-demo";
import { compatMarkup, initCompatDemo } from "./compat-demo";
import {
  createViteSetup,
  setupOptionsMarkup,
  type SetupProject,
} from "./setup";
import {
  runtimeMarkup,
  sdkIntegrityMarkup,
  initRuntimeDemo,
  reportRuntimeThreat,
} from "./runtime-demo";
import {
  hardeningMarkup,
  initHardeningDemo,
  reportHardeningThreat,
} from "./runtime-hardening";
const cubeArt = new URL("./assets/sdk-cube.webp", import.meta.url).href;
const webArt = new URL("./assets/web-app.webp", import.meta.url).href;
// Production uses the injected automatic instance; dev/HMR uses the same registry.
const guard = getAutoGuard() ?? installAutoGuard(siteGuardOptions);
let selectedExample: (typeof examples)[number] = examples[0];
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header class="site-header"><a class="brand" href="/" aria-label="WebGuard Playground"><span class="logo">W</span>WebGuard</a><nav class="site-links" aria-label="주요 메뉴"><a href="#sdk-strengths">SDK 강점</a><a href="#sdk-demo">데모 체험</a><a class="docs-link" href="/docs/">사용 가이드 ↗</a><a class="primary" href="#sdk-install">SDK 적용하기</a></nav></header>
<main class="sdk-site">
<aside id="site-protection-status" class="site-protection-strip" aria-label="이 페이지의 실제 보호 상태"><div><strong>이 페이지에도 WebGuard가 적용되어 있습니다.</strong><p id="site-protection-summary" aria-live="polite"></p></div><a href="#live-demo">이 페이지의 보호 설정 <span aria-hidden="true">↗</span></a></aside>
<section class="sdk-hero" aria-labelledby="hero-heading"><div class="hero-content"><div class="eyebrow">WEB PROTECTION SDK</div><h1 id="hero-heading">웹 코드 보호를,<br><span>빌드부터 런타임까지.</span></h1><p>JavaScript 난독화부터 실행 가드·배포 검증까지.<br>내 프로젝트의 빌드 흐름에 연결하는 웹 보호 SDK입니다.</p><p class="hero-environments">Vite 자동 통합 · Webpack / esbuild 후처리 · HTML SDK</p><div class="hero-actions"><a class="primary" href="#sdk-install">SDK 적용하기</a><a class="demo-link" href="#sdk-demo">데모 체험하기</a></div><div class="hero-flow"><div class="flow-art"><img src="${cubeArt}" alt="WebGuard SDK 패키지" width="180" height="180"><strong>WebGuard</strong><p class="flow-caption">내 앱에 설치하는 개발자 SDK</p></div><div class="hero-code-block"><div class="hero-code"><div class="code-filename">vite.config.ts</div><pre><code>import { defineConfig } from 'vite';
import { webguardApp } from 'uulab-webguard';

export default defineConfig({
  plugins: [webguardApp()],
});</code></pre></div><p class="flow-caption">패키지 설치 · Vite 설정 · 빌드</p></div><div class="flow-art"><img src="${webArt}" alt="보호 설정을 적용한 웹 앱" width="220" height="180"><strong>내 웹 앱</strong><p class="flow-caption">보호한 빌드 결과로 배포</p></div></div></div></section>
${productStoryMarkup}
${protectionOverviewMarkup}
<section id="sdk-demo" class="demo-hub" aria-labelledby="demo-heading"><div class="demo-heading"><div class="eyebrow">INTERACTIVE DEMO</div><h2 id="demo-heading">가드를 켜고, 직접 확인하세요.</h2><p>내 앱에 연결할 SDK의 동작을 먼저 체험해 보세요.</p></div><div class="demo-tabs" role="tablist" aria-label="SDK 체험 선택"><button id="tab-runtime" role="tab" data-demo-tab="runtime" aria-controls="runtime-view" aria-selected="true">브라우저 가드</button><button id="tab-obfuscation" role="tab" data-demo-tab="obfuscation" aria-controls="obfuscation-view" aria-selected="false" tabindex="-1">코드 난독화</button><button id="tab-integrity" role="tab" data-demo-tab="integrity" aria-controls="integrity-view" aria-selected="false" tabindex="-1">파일 검사</button><button id="tab-advanced" role="tab" data-demo-tab="advanced" aria-controls="advanced-view" aria-selected="false" tabindex="-1">고급 검사</button></div>
<div id="runtime-view" class="demo-view" role="tabpanel" aria-labelledby="tab-runtime" tabindex="0">${runtimeMarkup}${hardeningMarkup}</div>
<div id="integrity-view" class="demo-view" role="tabpanel" aria-labelledby="tab-integrity" tabindex="0" hidden>${sdkIntegrityMarkup}</div>
<div id="advanced-view" class="demo-view" role="tabpanel" aria-labelledby="tab-advanced" tabindex="0" hidden><nav class="advanced-navigation" aria-label="고급 검사 선택"><a href="#policy-lab">정책 켜기·끄기</a><a href="#security-lab">삽입·변조 시나리오</a><a href="#compatibility-lab">배포 호환성</a><a href="#resource-exposure">리소스 공개 검사</a></nav><p class="advanced-scope">브라우저 정책·배포 설정·서버 검증 예제입니다. 수동 SDK만 연결했을 때 자동으로 제공되는 기능과 구분해서 확인하세요.</p>${policyMarkup}${compatMarkup}${labMarkup}${resourceMarkup}</div>
<div id="obfuscation-view" class="demo-view" role="tabpanel" aria-labelledby="tab-obfuscation" tabindex="0" hidden>
<section id="try-examples" class="demo-section" aria-labelledby="try-heading"><div class="section-heading"><div><h2 id="try-heading">예제로 바로 시작하세요</h2><p>원클릭으로 High 난독화와 실제 실행 결과를 비교합니다. 코드는 이 브라우저에서만 처리합니다.</p></div><span class="badge">READY TO RUN</span></div><div class="sample-grid">${examples.map((item) => `<article class="sample-card"><h3>${item.title}</h3><p>${item.description}</p><p class="expected">예상 결과<br><code>${item.expected}</code></p><button class="sample-run" data-example="${item.id}">${item.title} 예제 실행</button></article>`).join("")}</div></section>
<section class="toolbar" aria-label="Protection controls"><div class="presets" role="group" aria-label="Protection preset"><button data-preset="basic" aria-pressed="false">Basic</button><button data-preset="standard" aria-pressed="true">Standard</button><button data-preset="high" aria-pressed="false">High</button></div><p id="preset-description">Balanced string protection for everyday builds.</p><button id="protect" class="primary">Protect & compare <span aria-hidden="true">↗</span></button></section>
<div id="status" role="status" aria-live="polite">Ready when you are. Start with the example or paste plain JavaScript.</div>
<section class="editors"><div class="panel"><div class="panel-head"><h2><span class="dot"></span>Source JavaScript</h2><button id="reset" class="text-button">Reset example</button></div><label class="sr-only" for="source">Source JavaScript</label><textarea id="source" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea><div class="panel-foot"><span>JAVASCRIPT</span><span id="source-bytes"></span></div></div><div class="panel"><div class="panel-head"><h2><span class="dot teal"></span>Protected output</h2><button id="copy" class="text-button" disabled>Copy code</button></div><label class="sr-only" for="output">Protected JavaScript</label><textarea id="output" readonly spellcheck="false" placeholder="Your protected code will appear here."></textarea><div class="panel-foot"><span id="output-label">AWAITING TRANSFORM</span><span id="output-bytes">—</span></div></div></section>
<section class="metrics" aria-label="Measured comparison"><article><h2>Code size</h2><strong id="size-change">—</strong><p id="size-detail">UTF-8 bytes, before → after</p></article><article><h2>Execution time</h2><strong id="timing">—</strong><p>Source → protected · one run, not a benchmark</p></article><article><h2>Output comparison</h2><strong id="equivalence">Not run</strong><p>Captured console output and completion status</p></article></section>
<section class="results"><div><h2>Execution output <span class="badge">ISOLATED</span></h2><pre id="logs">// Console output appears after protection.</pre></div><div><h2>Local protection report</h2><pre id="report">No report yet.</pre></div></section>
</div></section>
<section id="sdk-install" class="integration-start" aria-labelledby="install-heading"><div class="integration-content"><div class="eyebrow">SDK INTEGRATION</div><h2 id="install-heading">이제 내 프로젝트에 연결하세요.</h2><p>설치한 SDK와 빌드 설정으로 내 앱에 적용합니다.</p><ol class="integration-steps"><li><span>1</span><div><strong>패키지 설치</strong><p>검토한 로컬 후보로 시작</p></div></li><li><span>2</span><div><strong>빌드 연결</strong><p>Vite 플러그인 또는 범용 후처리</p></div></li><li><span>3</span><div><strong>앱 빌드</strong><p>보호한 결과와 배포 정책 확인</p></div></li></ol><div class="integration-actions"><a class="primary" href="/docs/#install">한국어 적용 가이드 보기</a><a class="demo-link" href="#setup">내 앱 설정 만들기</a><a class="demo-link" href="/docs/#environments">Webpack·esbuild·HTML 안내</a></div><p class="local">데모: 0.3.0 미게시 후보 · npm 공개 버전: 0.2.0</p><details class="setup-details" id="setup-details"><summary>적용 코드와 보호된 예제 앱 보기</summary><section id="setup" class="demo-section" aria-labelledby="setup-heading"><div class="section-heading"><div><h2 id="setup-heading">0.3.0 로컬 후보 적용 방법</h2><p>0.3.0은 미게시 후보이며 현재 npm 공개 버전은 0.2.0입니다. 로컬 tgz 검토 또는 게시 후 설치 절차는 <a href="/docs/#install">한국어 설치 가이드</a>에서 확인하세요. 자동 HTML 정책·HTTP 서버 정책·SDK의 적용 범위는 서로 다릅니다.</p></div></div><pre><code id="setup-install"># 미게시 0.3.0 후보 · 검토한 tgz의 실제 경로로 바꾸세요
npm install -D /absolute/path/to/uulab-webguard-0.3.0.tgz</code></pre><div class="setup-tabs" role="group" aria-label="적용 코드 선택">${integrations.map((item, index) => `<button data-integration="${item.id}" aria-pressed="${index === 0}">${item.title}</button>`).join("")}</div><p id="setup-hint"></p>${setupOptionsMarkup}<div class="code-panel"><pre><code id="setup-code"></code></pre><button id="copy-setup" class="sample-run">적용 코드 복사</button></div><p id="copy-setup-status" aria-live="polite"></p><details><summary>이 데모를 직접 실행하려면</summary><pre><code>pnpm install --frozen-lockfile
pnpm demo</code></pre><p>하나의 로컬 주소에서 Playground·세 가지 웹앱·문서를 제공합니다. JSP는 위 준비 명령으로 WAR를 만든 뒤 별도 Tomcat에서 실행하세요.</p></details></section>
<section id="app-examples" class="demo-section" aria-labelledby="apps-heading"><div class="section-heading"><div><h2 id="apps-heading">보호된 웹앱을 직접 써보세요</h2><p>난독화된 실제 빌드입니다. 폼·카운터·화면 이동·동적 모듈이 동작하는지 확인하세요.</p></div></div><div class="sample-grid"><article class="sample-card"><span class="badge">AUTOMATIC SDK · STRICT</span><h3>React + Vite</h3><p>SDK 자동 시작, 강한 난독화, 서버 헤더와 실시간 제어를 한 앱에서 체험합니다.</p><a class="demo-link" href="/examples/react/">React 데모 열기</a></article><article class="sample-card"><span class="badge">MANUAL SDK · STANDARD</span><h3>JavaScript</h3><p>SDK를 직접 연결한 예제입니다. 단축키 옵션을 켜고 입력·동적 로딩을 시험하세요.</p><a class="demo-link" href="/examples/vanilla-js/">JavaScript 데모 열기</a></article><article class="sample-card"><span class="badge">TYPESCRIPT · STANDARD</span><h3>TypeScript</h3><p>TypeScript를 빌드한 뒤 보호한 예제입니다. 실행 동작과 SDK 옵션을 확인하세요.</p><a class="demo-link" href="/examples/vanilla-ts/">TypeScript 데모 열기</a></article></div></section>
</details></div></section>
${productFaqMarkup}
<footer class="site-footer"><strong>WebGuard</strong><p>난독화는 분석을 어렵게 합니다. 권한 검증은 서버에서 처리하세요.</p><details><summary>보호 범위와 실행 제한</summary> Delivered JavaScript can still be inspected and modified. Keep secrets and authorization on your server. Execution supports console-based JavaScript, without DOM access; imports and network requests are blocked. Workers are stopped after 1 second. This is a testing aid, not a hostile-code containment service.</details></footer></main>`;
initDemoNavigation();
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
const cleanupHardening = initHardeningDemo(guard);
guard.update({
  onThreat: (event) => {
    reportHardeningThreat(event);
    reportRuntimeThreat(event);
  },
});
const cleanupRuntime = initRuntimeDemo(guard);
let currentIntegration: (typeof integrations)[number] = integrations[0];
function selectedSetup() {
  return createViteSetup({
    project: element<HTMLSelectElement>("setup-project").value as SetupProject,
    blockShortcuts: element<HTMLInputElement>("setup-shortcuts").checked,
    blockContextMenu: element<HTMLInputElement>("setup-context").checked,
  });
}
function integrationCode() {
  return currentIntegration.id === "vite"
    ? selectedSetup().code
    : currentIntegration.code;
}
function showIntegration() {
  element("setup-options").hidden = currentIntegration.id !== "vite";
  element("setup-policy-note").textContent = selectedSetup().note;
  element("setup-code").textContent = integrationCode();
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
    await navigator.clipboard.writeText(integrationCode());
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
element("setup-options").addEventListener("change", showIntegration);
showIntegration();
initLab();
const cleanupResources = initResources();
const cleanupPolicy = initPolicyDemo();
const cleanupCompat = initCompatDemo();
const cleanupOverview = initProtectionOverview();
element("runtime-tour").addEventListener("click", () => {
  if (
    protect.disabled ||
    element<HTMLButtonElement>("lab-all").disabled ||
    element<HTMLButtonElement>("resource-audit").disabled ||
    element<HTMLButtonElement>("policy-run").disabled ||
    element<HTMLButtonElement>("compat-run").disabled ||
    element<HTMLButtonElement>("runtime-integrity").disabled
  ) {
    element("runtime-tour-status").textContent =
      "진행 중인 시험이 있습니다. 결과가 나온 뒤 다시 시작하세요.";
    return;
  }
  if (!element<HTMLInputElement>("runtime-threshold").checkValidity()) {
    element("runtime-tour-status").textContent =
      "감지 기준을 40~1000 사이 정수로 입력한 뒤 시작하세요.";
    return;
  }
  element<HTMLInputElement>("sdk-integrity").checked = true;
  element("sdk-integrity").dispatchEvent(new Event("change"));
  element<HTMLButtonElement>("runtime-enable").click();
  for (const id of ["dom-block", "pause-block"])
    element<HTMLInputElement>(id).checked = false;
  element<HTMLButtonElement>("dom-restore").click();
  for (const id of ["dom-monitor", "pause-monitor"]) {
    element<HTMLInputElement>(id).checked = true;
    element(id).dispatchEvent(new Event("change"));
  }
  element<HTMLButtonElement>("dom-tamper").click();
  element<HTMLButtonElement>("pause-check").click();
  element<HTMLButtonElement>("runtime-integrity").click();
  element<HTMLButtonElement>("lab-all").click();
  element<HTMLButtonElement>("resource-audit").click();
  element<HTMLButtonElement>("policy-enable-all").click();
  element<HTMLButtonElement>("policy-run").click();
  element<HTMLButtonElement>("compat-run").click();
  selectPreset("high");
  protect.click();
  element("runtime-tour-status").textContent =
    "전체 기능 시험을 시작했습니다. 각 영역의 실제 결과를 확인하고, 본문 시험 영역에서 키·우클릭을 직접 시험하세요. 개발자도구 창 자체를 잠그는 기능은 아닙니다.";
});
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  cleanupRuntime();
  cleanupHardening();
  cleanupResources();
  cleanupPolicy();
  cleanupCompat();
  cleanupOverview();
  guard.destroy();
});
