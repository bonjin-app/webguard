import type { ThreatEvent, WebGuardInstance } from "@webguard/browser";
import styles from "./runtime-hardening.module.css";

export const hardeningMarkup = `
<section id="runtime-hardening" class="${styles.section}" aria-labelledby="hardening-heading">
<div class="eyebrow">CODE & RUNTIME PROTECTION</div><h3 id="hardening-heading">보이는 코드부터, 실행 중 변경까지.</h3>
<p>이 페이지의 실제 SDK가 실행 지연과 정적 안내 변경을 관찰합니다. 보호를 끄고 켜며 같은 동작을 비교하세요.</p><div class="${styles.actions}"><button id="hardening-enable" class="primary">보호 켜기</button><button id="hardening-disable" class="sample-run">보호 끄기</button></div><p class="${styles.note}">입력 제한·정적 DOM 감시·실행 지연 관찰을 함께 바꿉니다. 난독화는 배포 빌드에 계속 적용됩니다. 개발자도구 창 자체를 닫지는 않습니다.</p>
<div class="${styles.grid}">
<article class="${styles.card}"><span class="${styles.step}">01 · DOM INTEGRITY</span><h4>안내를 바꾸고, 감지해 보세요</h4>
<p>선택한 정적 영역의 실제 변경을 관찰합니다. 아래 안내를 버튼이나 Elements에서 바꾸면 결과를 확인할 수 있습니다.</p>
<div class="${styles.controls}"><label class="${styles.toggle}" for="dom-monitor"><span>정적 DOM 감시</span><input id="dom-monitor" type="checkbox" checked></label>
<label class="${styles.toggle}" for="dom-block"><span>감지 후 페이지 보호 안내</span><input id="dom-block" type="checkbox"></label>
<p id="dom-response-caption" class="${styles.caption}">기록 모드 · 변경을 기록하고 감시를 멈춥니다.</p></div>
<div id="dom-notice-slot"><div id="dom-protected-notice" class="${styles.notice}">공식 안내 · WebGuard</div></div>
<div class="${styles.actions}"><button id="dom-tamper" class="sample-run">안내 내용 바꾸기</button><button id="dom-restore" class="text-button">복구하고 감시 다시 시작</button></div>
<p id="dom-integrity-status" class="${styles.result}" role="status">기준 설정 중…</p>
<details class="${styles.details}"><summary>감지 조건과 한계</summary><p>감지 후에는 관찰을 멈춥니다. 감시를 다시 켜면 이 데모는 공식 안내를 먼저 복구합니다. 실제 앱의 정상 변경은 rebaselineDom()으로 기준을 갱신하세요. 동적 폼·카운터 전체를 감시하지 마세요. 서버 가격·권한 검증은 별도입니다.</p></details>
<details class="${styles.details}"><summary>이 안내의 클래스 난독화 확인</summary><output id="dom-identifier-result" class="${styles.result}"></output><p>CSS Modules 클래스는 배포 빌드에서 의미를 알기 어려운 이름으로 바뀝니다. 스타일과 JavaScript가 같은 이름을 참조합니다. HTML·내용·DOM ID는 보이며 CSSOM·Elements를 숨기지는 않습니다.</p></details></article>
<article class="${styles.card}"><span class="${styles.step}">02 · EXECUTION WATCH</span><h4>실행이 멈췄을 때의 신호 관찰</h4>
<p>페이지가 보이는 동안 자동으로 실행 지연을 측정합니다. 개발자도구를 여는 것만으로는 신호가 발생하지 않을 수 있습니다.</p>
<div class="${styles.controls}"><label class="${styles.toggle}" for="pause-monitor"><span>실행 지연 자동 관찰</span><input id="pause-monitor" type="checkbox" checked></label><label class="${styles.toggle}" for="pause-block"><span>감지 후 페이지 보호 안내</span><input id="pause-block" type="checkbox"></label>
<p id="pause-response-caption" class="${styles.caption}">기록 모드 · 지연 신호를 기록하고 페이지를 계속 사용할 수 있습니다.</p></div>
<ol class="${styles.instructions}"><li>자동 관찰을 켜고 첫 측정을 기다리세요.</li><li>Sources의 브레이크포인트 또는 일시정지 버튼으로 실행을 멈추세요.</li><li>3초 이상 기다린 뒤 F8 또는 재개 버튼을 누르세요. 재개 후 감지 기록을 확인하세요.</li></ol>
<p id="pause-status" class="${styles.result}" aria-live="off">관찰 상태 확인 중…</p><p id="pause-last-signal" class="${styles.signal}" role="status">아직 실행 지연 신호가 기록되지 않았습니다.</p>
<div class="${styles.actions}"><button id="pause-check" class="sample-run">지금 한 번 검사</button></div><p id="pause-manual-status" class="${styles.note}" role="status">수동 검사는 자동 관찰과 별도로 요청합니다.</p>
<details class="${styles.details}"><summary>감지 조건과 한계</summary><p>예정된 실행이 추가로 1.5초 이상 늦어지면 실행 재개 후 기록합니다. 짧은 정지·숨김 상태는 놓칠 수 있고, CPU 부하·절전도 같은 신호를 만들 수 있습니다. 개발자도구 열림을 확정하거나 창을 닫지 않습니다.</p><p>보호 안내 스위치는 감지 후 동작만 바꿉니다. 스위치를 켜는 것 자체로 감지하거나 화면을 차단하지 않습니다. 반복 debugger·화면 멈춤 코드는 사용하지 않습니다.</p></details></article>
</div><details class="${styles.code}"><summary>이 기능을 내 앱에 적용하는 코드</summary><pre><code>// vite.config.ts — 미게시 0.3.0 후보
import { webguardApp } from 'uulab-webguard';
export default { plugins: [webguardApp({ domIdentifiers: true })] };

// 앱 코드 — 정적 안내를 렌더링한 뒤
import { getWebGuard } from 'uulab-webguard/client';
const guard = getWebGuard();
guard?.update({
  domIntegrity: { enabled: true, selectors: ['#static-notice'], response: 'report' },
  debugging: { enabled: true, watch: true, intervalMs: 1000, response: 'report' },
});
await guard?.checkDebugging(); // 명시적 단일 검사
// 정상 DOM 변경 후: guard?.rebaselineDom();</code></pre><a href="/docs/#runtime-hardening">설정·SSR 사용 시 주의사항 보기 →</a></details></section>`;

const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canonicalNotice = "공식 안내 · WebGuard";
let running = false;
let revision = 0;
let alive = false;
let renderWatchState: (() => void) | undefined;
let domStopped = false;

export function reportHardeningThreat(event: ThreatEvent) {
  if (!alive) return;
  if (
    event.type === "dom-integrity-mismatch" ||
    event.type === "dom-integrity-error"
  ) {
    domStopped = true;
    get<HTMLInputElement>("dom-monitor").checked = false;
    get("dom-integrity-status").textContent =
      event.type === "dom-integrity-mismatch"
        ? "변경 감지 · 관찰 중지됨 · 복구하고 감시 다시 시작을 눌러 다시 비교하세요."
        : "DOM 검사 오류 · 관찰 중지됨 · 기준 수집 실패 또는 예산 초과를 확인하세요.";
  }
  if (event.type === "execution-pause-suspected") {
    get("pause-last-signal").textContent =
      `${new Date().toLocaleTimeString()} · 실행 지연 신호 감지 · 개발자도구 열림을 확정하지 않습니다.`;
    renderWatchState?.();
  }
}
export function initHardeningDemo(guard: WebGuardInstance) {
  alive = true;
  domStopped = false;
  let serial = 0;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const checked = (id: string) => get<HTMLInputElement>(id).checked;
  const noticeSlot = get("dom-notice-slot");
  const originalNotice = get("dom-protected-notice");
  function restoreCanonicalNotice() {
    const canonical = document.createElement("div");
    canonical.id = "dom-protected-notice";
    canonical.className = styles.notice!;
    canonical.textContent = canonicalNotice;
    const current = document.getElementById("dom-protected-notice");
    const unchanged =
      noticeSlot.childNodes.length === 1 &&
      current?.parentNode === noticeSlot &&
      current.isEqualNode(canonical);
    if (!unchanged) {
      // Restore only this demo's dedicated slot. Never baseline a detached,
      // moved, or replacement node supplied through Elements.
      if (originalNotice.isConnected && !noticeSlot.contains(originalNotice))
        originalNotice.remove();
      if (current?.isConnected && !noticeSlot.contains(current))
        current.remove();
      noticeSlot.replaceChildren(canonical);
    }
    get("dom-identifier-result").textContent =
      `지금 이 DOM의 실제 클래스: ${styles.notice}`;
    return !unchanged;
  }
  restoreCanonicalNotice();
  function renderWatch() {
    if (!alive) return;
    const state = guard.getDebuggingState();
    const labels = {
      off: "실행 지연 관찰 OFF",
      manual: "수동 검사만 허용",
      watching: "실행 지연 자동 관찰 중",
      suspended: "페이지가 숨겨져 관찰 일시 중지",
      unavailable: "이 환경에서 자동 관찰을 사용할 수 없음",
    };
    const output = get("pause-status");
    output.dataset.watchState = state.state;
    output.dataset.samples = String(state.samples);
    output.textContent = `${labels[state.state]} · 완료한 자동 측정 ${state.samples}회${state.lastCheckedAt ? ` · 최근 ${new Date(state.lastCheckedAt).toLocaleTimeString()}` : " · 첫 측정 대기"}${typeof state.lastDelayMs !== "number" ? "" : ` · 추가 지연 ${Math.round(state.lastDelayMs)}ms`}`;
  }
  renderWatchState = renderWatch;
  function scheduleStatus() {
    clearTimeout(poll);
    if (!alive) return;
    renderWatch();
    if (document.visibilityState === "hidden") return;
    poll = setTimeout(scheduleStatus, 1000);
  }
  function configureDom() {
    const restored = checked("dom-monitor") && restoreCanonicalNotice();
    guard.update({
      domIntegrity: {
        enabled: checked("dom-monitor"),
        selectors: ["#dom-protected-notice"],
        response: checked("dom-block") ? "block" : "report",
      },
    });
    if (!checked("dom-monitor")) {
      domStopped = false;
      get("dom-integrity-status").textContent =
        "DOM 감시 OFF · 변경을 감지하지 않습니다.";
    } else if (guard.rebaselineDom()) {
      domStopped = false;
      get("dom-integrity-status").textContent =
        `${restored ? "공식 안내 복구됨 · " : ""}기준 설정됨 · 정적 안내의 텍스트·속성·삭제·교체를 관찰합니다.`;
    }
  }
  function configurePause() {
    revision++;
    if (running) guard.update({ debugging: { enabled: false, watch: false } });
    const cancelled = running;
    running = false;
    get<HTMLButtonElement>("pause-check").disabled = !checked("pause-monitor");
    if (cancelled || !checked("pause-monitor"))
      get("pause-manual-status").textContent = checked("pause-monitor")
        ? "설정 변경으로 이전 수동 검사를 취소했습니다."
        : "실행 지연 검사 OFF · 먼저 관찰을 켜세요.";
    guard.update({
      debugging: {
        enabled: checked("pause-monitor"),
        watch: checked("pause-monitor"),
        response: checked("pause-block") ? "block" : "report",
        sampleMs: 1000,
        thresholdMs: 1500,
        intervalMs: 1000,
      },
    });
    renderWatch();
  }
  get("dom-monitor").addEventListener("change", configureDom);
  function renderResponses() {
    get("dom-response-caption").textContent = checked("dom-block")
      ? "보호 안내 모드 · 변경을 감지하면 페이지 보호 안내를 표시합니다."
      : "기록 모드 · 변경을 기록하고 감시를 멈춥니다.";
    get("pause-response-caption").textContent = checked("pause-block")
      ? "보호 안내 모드 · 지연 신호를 감지한 뒤 페이지 보호 안내를 표시합니다. 켜는 것만으로 감지하지 않습니다."
      : "기록 모드 · 지연 신호를 기록하고 페이지를 계속 사용할 수 있습니다.";
  }
  get("dom-block").addEventListener("change", () => {
    renderResponses();
    // Response changes must never accept a modified DOM as a new baseline.
    guard.update({
      domIntegrity: { response: checked("dom-block") ? "block" : "report" },
    });
    if (domStopped)
      get("dom-integrity-status").textContent =
        "변경 감지 · 관찰 중지됨 · 복구하고 감시 다시 시작을 눌러 다시 비교하세요.";
  });
  get("pause-monitor").addEventListener("change", configurePause);
  get("pause-block").addEventListener("change", () => {
    guard.update({
      debugging: { response: checked("pause-block") ? "block" : "report" },
    });
    renderResponses();
    renderWatch();
  });
  get("dom-tamper").addEventListener("click", () => {
    // The monitored node may have been replaced or removed through Elements.
    let notice = noticeSlot.querySelector<HTMLElement>("#dom-protected-notice");
    if (!notice) {
      restoreCanonicalNotice();
      notice = noticeSlot.querySelector<HTMLElement>("#dom-protected-notice");
    }
    if (notice)
      notice.textContent = `변경된 안내 ${++serial} · 승인되지 않은 내용`;
  });
  function restoreDom() {
    get<HTMLInputElement>("dom-monitor").checked = true;
    configureDom();
  }
  get("dom-restore").addEventListener("click", restoreDom);
  get("pause-check").addEventListener("click", async () => {
    if (running) return;
    if (!checked("pause-monitor")) {
      get("pause-manual-status").textContent =
        "실행 지연 검사 OFF · 먼저 관찰을 켜세요.";
      return;
    }
    running = true;
    const run = ++revision;
    get<HTMLButtonElement>("pause-check").disabled = true;
    get("pause-manual-status").textContent =
      "수동 검사 중 · 페이지를 계속 표시해 주세요.";
    const suspected = await guard.checkDebugging();
    if (!alive || run !== revision) return;
    running = false;
    get<HTMLButtonElement>("pause-check").disabled = false;
    get("pause-manual-status").textContent = suspected
      ? "이번 검사에서 실행 지연 신호 감지 · 개발자도구 열림을 확정하지 않습니다."
      : "이번 검사에서 추가 실행 지연 신호 없음 · 자동 측정과 겹치거나 숨김·취소된 검사는 정상 판정이 아닙니다.";
    renderWatch();
  });
  function setProtection(enabled: boolean) {
    get<HTMLButtonElement>(
      enabled ? "runtime-enable" : "runtime-disable",
    ).click();
    if (enabled) {
      get<HTMLInputElement>("runtime-page-block").checked = true;
      get("runtime-page-block").dispatchEvent(
        new Event("change", { bubbles: true }),
      );
    }
    get<HTMLInputElement>("pause-monitor").checked = enabled;
    if (enabled) restoreDom();
    else {
      get<HTMLInputElement>("dom-monitor").checked = false;
      configureDom();
    }
    configurePause();
  }
  get("hardening-enable").addEventListener("click", () => setProtection(true));
  get("hardening-disable").addEventListener("click", () =>
    setProtection(false),
  );
  const release = () => {
    for (const id of ["dom-monitor", "pause-monitor"])
      get<HTMLInputElement>(id).checked = false;
    configureDom();
    configurePause();
  };
  const defaults = () => {
    get<HTMLInputElement>("dom-block").checked = false;
    get<HTMLInputElement>("pause-block").checked = false;
    get<HTMLInputElement>("pause-monitor").checked = true;
    restoreDom();
    configurePause();
    renderResponses();
  };
  window.addEventListener("webguard-demo-release", release);
  window.addEventListener("webguard-demo-defaults", defaults);
  const suspendStatus = () => clearTimeout(poll);
  document.addEventListener("visibilitychange", scheduleStatus);
  window.addEventListener("pagehide", suspendStatus);
  window.addEventListener("pageshow", scheduleStatus);
  configureDom();
  configurePause();
  renderResponses();
  scheduleStatus();
  return () => {
    alive = false;
    revision++;
    clearTimeout(poll);
    renderWatchState = undefined;
    window.removeEventListener("webguard-demo-release", release);
    window.removeEventListener("webguard-demo-defaults", defaults);
    document.removeEventListener("visibilitychange", scheduleStatus);
    window.removeEventListener("pagehide", suspendStatus);
    window.removeEventListener("pageshow", scheduleStatus);
  };
}
