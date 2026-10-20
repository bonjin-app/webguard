import type { ThreatEvent, WebGuardInstance } from "@webguard/browser";
export const runtimeMarkup = `
<section id="live-demo" class="demo-section runtime-demo" aria-labelledby="runtime-heading">
<div class="section-heading"><div><div class="eyebrow">LIVE SDK · THIS PAGE</div><h2 id="runtime-heading">먼저 보호 옵션을 켜고 직접 시험하세요</h2><p>아래 설정은 이 페이지의 실제 SDK에 즉시 적용됩니다. 새로고침하면 관찰 모드로 돌아갑니다.</p></div><a class="demo-link" href="#security-lab">삽입·변조 시나리오 ↓</a></div>
<div class="runtime-limit"><strong>개발자도구 창 자체는 차단하지 못합니다.</strong><p>이 체험은 페이지가 받는 단축키·우클릭 입력을 제한합니다. Chrome 메뉴, 이미 열린 도구, 외부 디버깅과 콘솔 실행은 통제하지 못합니다. 감지는 창 크기에 따른 추정 신호입니다.</p></div>
<div class="lab-actions"><button id="runtime-tour" class="primary">전체 기능 체험 시작</button><p id="runtime-tour-status" aria-live="polite">입력 제한·정책 스위치 → 배포 호환성·파일 검사 → 삽입·변조 5종 → High 난독화를 시작합니다. 실제 키 입력은 아래 영역에서 직접 시험하세요.</p></div>
<div class="lab-actions"><button id="runtime-enable" class="primary">입력 제한 켜기</button><button id="runtime-disable" class="sample-run">입력 제한 끄기</button><p id="runtime-state" aria-live="polite"></p></div>
<div class="runtime-grid"><article class="sample-card"><h3>1. 실제 SDK 설정</h3><div class="toggles">
<label><input id="shortcuts" type="checkbox"> 단축키 제한 · Restrict F12 / inspect shortcuts</label>
<label><input id="context" type="checkbox"> 우클릭 제한 · Restrict context menu</label>
<label><input id="runtime-detect" type="checkbox" checked> 창 크기 추정 감지</label>
<label><input id="runtime-warn" type="checkbox"> SDK 경고를 콘솔에도 출력</label>
<label><input id="sdk-integrity" type="checkbox" checked> 명시적 SDK 파일 검사 허용</label>
<label for="runtime-threshold">감지 기준 차이 (픽셀)<input id="runtime-threshold" type="number" min="40" max="1000" step="1" value="160"></label></div><p id="runtime-config-error" aria-live="polite"></p><details><summary>지금 적용된 update 코드</summary><pre id="runtime-config"></pre></details></article>
<article class="sample-card"><h3>2. 실제 입력으로 비교</h3><p>아래 본문 영역을 클릭한 뒤 F12 또는 Ctrl+Shift+I / ⌘+⌥+I를 누르거나 영역 안을 우클릭하세요.</p><div id="runtime-target" class="runtime-target" tabindex="0" role="group" aria-label="본문 시험 영역">여기를 클릭하고 단축키·우클릭 시험<br><small>단축키가 페이지에 전달되어야 기록됩니다.</small></div><label for="runtime-editor">편집 허용 시험 입력</label><input id="runtime-editor" placeholder="입력·편집·우클릭은 제한에서 제외됩니다."><p id="runtime-input-result" class="runtime-outcome" aria-live="polite">아직 실제 입력이 관측되지 않았습니다.</p><details open><summary>모바일·자동화용 합성 이벤트 검사</summary><div class="lab-actions"><button id="test-f12" class="sample-run">F12 시험 이벤트 실행</button><button id="test-menu" class="sample-run">우클릭 시험 이벤트 실행</button></div><p id="live-result" aria-live="polite">옵션을 바꾸고 시험 이벤트를 실행해 보세요.</p><p>합성 이벤트는 SDK의 이벤트 취소만 시험합니다. 실제 개발자도구 열림 여부를 검사하지 않습니다.</p></details></article>
<article class="sample-card"><h3>3. SDK 무결성 검사·기록</h3><p>보호된 예제의 실제 파일을 SDK의 checkIntegrity()로 읽고, 정상 해시와 한 글자 다른 기대 해시를 비교합니다.</p><button id="runtime-integrity" class="sample-run">SDK 파일 검사</button><pre id="runtime-integrity-result" class="lab-result" aria-live="polite">아직 검사하지 않았습니다.</pre><p class="lab-limit">공개 manifest를 기준으로 한 SDK 검사 체험입니다. 변조한 파일을 배포하거나 실행하지 않습니다. 신뢰할 수 있는 기준 해시의 배포는 별도 책임입니다.</p><p id="detection">감지된 추정 신호 없음 · 실제 개발자도구 열림 상태는 판정하지 않습니다.</p><div class="lab-actions"><h3>로컬 이벤트 기록</h3><button id="runtime-clear" class="text-button">기록 지우기</button></div><ul id="runtime-log" class="runtime-log" aria-live="polite" aria-label="로컬 이벤트 기록"></ul><p>최근 20건만 이 화면에 기록합니다. 입력 내용은 수집하지 않고 기록을 서버로 보내지 않습니다.</p></article></div>
</section>`;
const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let integrityMismatches = 0;
function log(message: string) {
  const list = get("runtime-log");
  const row = document.createElement("li");
  row.textContent = `${new Date().toLocaleTimeString()} · ${message}`;
  list.prepend(row);
  while (list.children.length > 20) list.lastElementChild?.remove();
}
export function reportRuntimeThreat(event: ThreatEvent) {
  if (event.type === "integrity-mismatch") integrityMismatches++;
  const names: Record<string, string> = {
    "shortcut-blocked": "SDK 단축키 제한 이벤트",
    "context-menu-blocked": "SDK 우클릭 제한 이벤트",
    "devtools-heuristic": "창 크기 추정 신호 · 오탐 가능",
    "integrity-mismatch": "SDK 무결성 불일치 이벤트",
    "integrity-error": "SDK 파일 읽기·검사 오류",
  };
  const message = names[event.type] ?? "SDK 알림";
  log(message);
  if (event.type === "devtools-heuristic")
    get("detection").textContent =
      `${message} · 개발자도구 열림을 확정하지 않습니다.`;
}
export function initRuntimeDemo(guard: WebGuardInstance) {
  const check = (id: string) => get<HTMLInputElement>(id).checked;
  let revision = 0;
  let checking = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  function configure() {
    const threshold = get<HTMLInputElement>("runtime-threshold").valueAsNumber;
    if (!Number.isInteger(threshold) || threshold < 40 || threshold > 1000) {
      get("runtime-config-error").textContent =
        "감지 기준은 40~1000 사이 정수로 입력하세요. 기존 설정을 유지합니다.";
      return;
    }
    revision++;
    if (checking) guard.update({ integrity: { enabled: false } });
    guard.update({
      devtools: {
        detect: check("runtime-detect"),
        blockShortcuts: check("shortcuts"),
        blockContextMenu: check("context"),
        response: check("runtime-warn") ? "warn" : "monitor",
        threshold,
      },
      integrity: { enabled: check("sdk-integrity") },
    });
    get("runtime-config-error").textContent = "";
    const options = guard.getOptions();
    get("runtime-state").textContent =
      `현재 적용: 단축키 ${options.devtools?.blockShortcuts ? "ON" : "OFF"} · 우클릭 ${options.devtools?.blockContextMenu ? "ON" : "OFF"}`;
    get("runtime-config").textContent =
      `guard.update(${JSON.stringify({ devtools: options.devtools, integrity: options.integrity }, null, 2)});`;
    get("runtime-input-result").textContent =
      "설정 적용됨 · 본문과 입력 영역에서 다시 시험하세요.";
    get("runtime-integrity-result").textContent = check("sdk-integrity")
      ? "검사 허용 · 버튼을 눌러 실제 파일을 검사하세요."
      : "무결성 검사가 꺼져 있습니다.";
    get("detection").textContent = check("runtime-detect")
      ? "창 크기 추정 감지 ON · 이후 창 크기 변경을 관찰합니다. 열림 상태는 판정하지 않습니다."
      : "창 크기 추정 감지 OFF";
  }
  for (const id of [
    "shortcuts",
    "context",
    "runtime-detect",
    "runtime-warn",
    "sdk-integrity",
    "runtime-threshold",
  ])
    get(id).addEventListener("change", configure);
  for (const enabled of [true, false])
    get(enabled ? "runtime-enable" : "runtime-disable").addEventListener(
      "click",
      () => {
        get<HTMLInputElement>("shortcuts").checked = enabled;
        get<HTMLInputElement>("context").checked = enabled;
        configure();
        log(`설정 변경 · 입력 제한 ${enabled ? "ON" : "OFF"}`);
      },
    );
  get("runtime-clear").addEventListener("click", () =>
    get("runtime-log").replaceChildren(),
  );
  function observe(event: Event) {
    if (event instanceof KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (
        key !== "f12" &&
        !(
          ["i", "j", "c"].includes(key) &&
          ((event.ctrlKey && event.shiftKey) || (event.metaKey && event.altKey))
        )
      )
        return;
    }
    const editable = event
      .composedPath()
      .some(
        (target) =>
          target instanceof Element &&
          target.matches('input,textarea,select,[contenteditable="true"]'),
      );
    // Wait for the next task: native events can run microtasks between listeners.
    setTimeout(() => {
      const result = `${event.isTrusted ? "실제 입력" : "합성 이벤트"} · ${event.type === "keydown" ? "검사 단축키" : "우클릭"} · ${editable ? "입력 영역" : "본문"} · ${event.defaultPrevented ? "차단됨 (페이지 기본 동작 취소)" : "허용됨"}`;
      log(result);
      if (event.isTrusted) get("runtime-input-result").textContent = result;
    }, 0);
  }
  document.addEventListener("keydown", observe, true);
  document.addEventListener("contextmenu", observe, true);
  const synthetic = (event: Event, label: string) => {
    document.dispatchEvent(event);
    get("live-result").textContent =
      `${label} 합성 시험 이벤트: ${event.defaultPrevented ? "차단됨" : "허용됨"} · 실제 개발자도구 열림 판정 아님`;
  };
  get("test-f12").addEventListener("click", () =>
    synthetic(
      new KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        cancelable: true,
      }),
      "F12",
    ),
  );
  get("test-menu").addEventListener("click", () =>
    synthetic(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      "우클릭",
    ),
  );
  get("runtime-integrity").addEventListener("click", async () => {
    if (checking) return;
    if (guard.getOptions().integrity?.enabled !== true) {
      get("runtime-integrity-result").textContent =
        "무결성 검사가 꺼져 있습니다.";
      return;
    }
    checking = true;
    const button = get<HTMLButtonElement>("runtime-integrity");
    button.disabled = true;
    const startedRevision = revision;
    deadline = setTimeout(() => {
      if (revision !== startedRevision) return;
      get<HTMLInputElement>("sdk-integrity").checked = false;
      configure();
      get("runtime-integrity-result").textContent =
        "10초 초과 · 검사를 중단했습니다. 무결성 검사를 다시 켜고 시도하세요.";
    }, 10000);
    get("runtime-integrity-result").textContent = "실제 SDK 파일 검사 중…";
    try {
      const response = await fetch(
        "/examples/vanilla-js/webguard-manifest.json",
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
      const manifest = (await response.json()) as {
        version: number;
        files: Record<string, { integrity: string }>;
      };
      const entry = Object.entries(manifest.files).find(([path]) =>
        /^assets\/[A-Za-z0-9_-]+\.js$/.test(path),
      );
      if (
        manifest.version !== 1 ||
        !entry ||
        !/^sha384-[A-Za-z0-9+/]{64}$/.test(entry[1].integrity)
      )
        throw new Error("검사 기준 파일이 올바르지 않습니다.");
      const expected = entry[1].integrity;
      const altered =
        expected.slice(0, -1) + (expected.endsWith("A") ? "B" : "A");
      const url = `/examples/vanilla-js/${entry[0]}`;
      const beforeNormal = integrityMismatches;
      const normal = await guard.checkIntegrity(url, expected);
      const normalMismatch = integrityMismatches > beforeNormal;
      if (revision !== startedRevision) return;
      const previousMismatches = integrityMismatches;
      const mismatched = await guard.checkIntegrity(url, altered);
      if (revision !== startedRevision) return;
      const mismatchConfirmed =
        !mismatched && integrityMismatches > previousMismatches;
      get("runtime-integrity-result").textContent =
        `정상 해시: ${normal ? "일치" : normalMismatch ? "불일치" : "검사 실패"}\n다른 기대 해시: ${mismatchConfirmed ? "불일치" : "확인 불가"}\n검사 파일: ${entry[0]}\n${normal && mismatchConfirmed ? "SDK의 실제 파일 읽기·해시 비교 완료" : "기준 파일 검사 실패 · 성공으로 판정하지 않음"}`;
    } catch (error) {
      if (revision === startedRevision)
        get("runtime-integrity-result").textContent =
          `검사 실패: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      clearTimeout(deadline);
      checking = false;
      button.disabled = false;
    }
  });
  configure();
  return () => {
    revision++;
    clearTimeout(deadline);
    document.removeEventListener("keydown", observe, true);
    document.removeEventListener("contextmenu", observe, true);
  };
}
