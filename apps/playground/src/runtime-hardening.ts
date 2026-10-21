import type { ThreatEvent, WebGuardInstance } from "@webguard/browser";
import styles from "./runtime-hardening.module.css";

export const hardeningMarkup = `
<section id="runtime-hardening" class="${styles.section}" aria-labelledby="hardening-heading">
<div class="eyebrow">CODE & RUNTIME PROTECTION</div><h3 id="hardening-heading">보이는 코드부터, 실행 중 변경까지.</h3>
<p>이 페이지의 실제 CSS 클래스와 SDK를 사용합니다. 보호를 켜고, 같은 변경을 다시 시도해 보세요.</p>
<div class="${styles.grid}">
<article class="${styles.card}"><span class="${styles.step}">01 · BUILD</span><h4>Elements의 클래스 이름도 변환</h4>
<p>이 안내의 CSS Modules 클래스는 빌드 때 의미를 알기 어려운 이름으로 바뀝니다. 스타일과 JavaScript가 같은 이름을 참조합니다.</p>
<div id="dom-protected-notice" class="${styles.notice}">공식 안내 · WebGuard</div><output id="dom-identifier-result" class="${styles.result}"></output>
<p class="${styles.note}">운영 빌드에 적용됩니다. HTML·내용·DOM ID는 보이며, 전역 CSS와 기존 선택자를 임의로 바꾸지 않습니다. CSSOM·Elements를 숨기는 기능은 아닙니다.</p></article>
<article class="${styles.card}"><span class="${styles.step}">02 · DOM</span><h4>선택한 정적 영역의 변경 감지</h4>
<p>옆의 안내를 SDK 기준과 비교합니다. 버튼은 실제 DOM 텍스트를 바꾸며, Elements에서 직접 바꿔도 같은 감시가 동작합니다.</p>
<label class="${styles.toggle}"><span>정적 DOM 감시</span><input id="dom-monitor" type="checkbox"></label>
<label class="${styles.toggle}"><span>변경 시 페이지 보호 안내</span><input id="dom-block" type="checkbox"></label>
<div class="${styles.actions}"><button id="dom-tamper" class="sample-run">안내 내용 바꾸기</button><button id="dom-restore" class="text-button">원래 안내로 복구·기준 재설정</button></div>
<p id="dom-integrity-status" class="${styles.result}" role="status">DOM 감시 OFF · 변경을 감지하지 않습니다.</p>
<p class="${styles.note}">감지 후 관찰을 멈춥니다. 정상 변경은 rebaselineDom()으로 기준을 갱신하세요. 동적 폼·카운터 전체를 감시하지 마세요. 서버의 가격·권한 검증은 별도입니다.</p></article>
<article class="${styles.card} ${styles.wide}"><div><span class="${styles.step}">03 · EXECUTION</span><h4>실행 지연 신호 확인</h4>
<p>checkDebugging() 호출마다 타이머를 한 번 측정합니다. 1초 뒤 예정된 실행이 추가로 1.5초 이상 늦어지면 신호를 기록합니다. 반복 debugger·화면 멈춤 코드는 넣지 않습니다.</p>
<p class="${styles.note}">브레이크포인트에서 멈췄다가 재개한 경우도 관측할 수 있습니다. CPU 부하·절전도 원인이 될 수 있으며, 개발자도구 열림을 확정하지 않습니다. 숨김·취소 상태의 false는 정상 판정이 아닙니다.</p></div>
<div><label class="${styles.toggle}"><span>명시적 실행 지연 검사 허용</span><input id="pause-monitor" type="checkbox"></label><label class="${styles.toggle}"><span>신호 감지 시 페이지 보호 안내</span><input id="pause-block" type="checkbox"></label>
<button id="pause-check" class="primary">실행 지연 검사</button><p id="pause-status" class="${styles.result}" role="status">실행 지연 검사 OFF</p></div></article>
</div><details class="${styles.code}"><summary>이 기능을 내 앱에 적용하는 코드</summary><pre><code>// vite.config.ts — 미게시 0.3.0 후보
import { webguardApp } from 'uulab-webguard';
export default { plugins: [webguardApp({ domIdentifiers: true })] };

// 앱 코드 — 정적 안내를 렌더링한 뒤
import { getWebGuard } from 'uulab-webguard/client';
const guard = getWebGuard();
guard?.update({
  domIntegrity: { enabled: true, selectors: ['#static-notice'], response: 'report' },
  debugging: { enabled: true, response: 'report' },
});
await guard?.checkDebugging(); // 명시적 단일 검사
// 정상 DOM 변경 후: guard?.rebaselineDom();</code></pre><a href="/docs/#runtime-hardening">설정·SSR 사용 시 주의사항 보기 →</a></details></section>`;

const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let running = false;
let revision = 0;
let alive = false;
export function reportHardeningThreat(event: ThreatEvent) {
  if (!alive) return;
  if (event.type === "dom-integrity-mismatch")
    get("dom-integrity-status").textContent =
      "변경 감지 · SDK 이벤트 수신 · 관찰 중지. 복구·기준 재설정 후 다시 검사할 수 있습니다.";
  if (event.type === "dom-integrity-error")
    get("dom-integrity-status").textContent =
      "DOM 검사 오류 · 기준 수집 실패 또는 예산 초과. 관찰이 중지되었습니다.";
  if (event.type === "execution-pause-suspected")
    get("pause-status").textContent =
      "실행 지연 신호 감지 · 개발자도구 열림을 확정하지 않습니다.";
}
export function initHardeningDemo(guard: WebGuardInstance) {
  alive = true;
  const checked = (id: string) => get<HTMLInputElement>(id).checked;
  const notice = get("dom-protected-notice");
  get("dom-identifier-result").textContent =
    `지금 이 DOM의 실제 클래스: ${notice.className}`;
  function configureDom() {
    guard.update({
      domIntegrity: {
        enabled: checked("dom-monitor"),
        selectors: ["#dom-protected-notice"],
        response: checked("dom-block") ? "block" : "report",
      },
    });
    if (!checked("dom-monitor"))
      get("dom-integrity-status").textContent =
        "DOM 감시 OFF · 변경을 감지하지 않습니다.";
    else if (guard.rebaselineDom())
      get("dom-integrity-status").textContent =
        "기준 설정됨 · 정적 안내의 텍스트·속성·삭제·교체를 관찰합니다.";
  }
  function configurePause() {
    revision++;
    if (running) guard.update({ debugging: { enabled: false } });
    running = false;
    get<HTMLButtonElement>("pause-check").disabled = false;
    guard.update({
      debugging: {
        enabled: checked("pause-monitor"),
        response: checked("pause-block") ? "block" : "report",
        sampleMs: 1000,
        thresholdMs: 1500,
      },
    });
    get("pause-status").textContent = checked("pause-monitor")
      ? "검사 허용 · 버튼을 눌러 한 번 측정하세요."
      : "실행 지연 검사 OFF";
  }
  for (const id of ["dom-monitor", "dom-block"])
    get(id).addEventListener("change", configureDom);
  for (const id of ["pause-monitor", "pause-block"])
    get(id).addEventListener("change", configurePause);
  get("dom-tamper").addEventListener("click", () => {
    notice.textContent = "변경된 안내 · 승인되지 않은 내용";
  });
  get("dom-restore").addEventListener("click", () => {
    notice.textContent = "공식 안내 · WebGuard";
    configureDom();
  });
  get("pause-check").addEventListener("click", async () => {
    if (running) return;
    if (!checked("pause-monitor")) {
      get("pause-status").textContent =
        "실행 지연 검사 OFF · 먼저 검사를 켜세요.";
      return;
    }
    running = true;
    const run = ++revision;
    get<HTMLButtonElement>("pause-check").disabled = true;
    get("pause-status").textContent = "검사 중 · 페이지를 계속 표시해 주세요.";
    const suspected = await guard.checkDebugging();
    if (!alive || run !== revision) return;
    running = false;
    get<HTMLButtonElement>("pause-check").disabled = false;
    get("pause-status").textContent = suspected
      ? "실행 지연 신호 감지 · 개발자도구 열림을 확정하지 않습니다."
      : "이번 검사에서 큰 실행 지연 신호 없음 · 숨김·취소된 검사는 정상 판정이 아닙니다.";
  });
  const release = () => {
    for (const id of ["dom-monitor", "pause-monitor"])
      get<HTMLInputElement>(id).checked = false;
    configureDom();
    configurePause();
  };
  window.addEventListener("webguard-demo-release", release);
  return () => {
    alive = false;
    revision++;
    window.removeEventListener("webguard-demo-release", release);
  };
}
