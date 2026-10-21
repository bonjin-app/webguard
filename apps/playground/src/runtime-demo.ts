import type { ThreatEvent, WebGuardInstance } from "@webguard/browser";
const inputArt = new URL("./assets/input-try.webp", import.meta.url).href;
export const runtimeMarkup = `
<section id="live-demo" class="demo-section runtime-demo" aria-labelledby="runtime-heading">
<h3 id="runtime-heading" class="sr-only">브라우저 가드 실시간 체험</h3>
<div class="runtime-switches"><label class="switch-label"><span>페이지 보호 모드</span><input id="runtime-page-block" type="checkbox"></label><label class="switch-label"><span>단축키 제한<span class="sr-only"> · Restrict F12 / inspect shortcuts</span></span><input id="shortcuts" type="checkbox" checked></label><label class="switch-label"><span>우클릭 제한<span class="sr-only"> · Restrict context menu</span></span><input id="context" type="checkbox"></label></div>
<div id="runtime-target" class="runtime-target" tabindex="0" role="group" aria-label="본문 시험 영역"><h3>여기를 클릭하고 단축키를 눌러보세요.</h3><p>Mac ⌘+⌥+I · Windows Ctrl+Shift+I · F12<br>우클릭은 별도 스위치로 켜고 끌 수 있습니다.</p><img src="${inputArt}" alt="" width="150" height="140"><p id="runtime-input-result" class="runtime-outcome" aria-live="polite">아직 실제 입력이 관측되지 않았습니다.</p></div><p id="runtime-state" class="runtime-state" aria-live="polite"></p>
<p class="runtime-scope">이 데모는 단축키 제한 ON으로 시작합니다. 스위치를 끄면 보호 전과 비교할 수 있습니다. 기본 모드는 입력·편집 영역을 제외합니다. 페이지 보호 모드를 켜면 입력 영역에서도 검사 단축키를 제한하고 페이지 사용을 가립니다. 브라우저 메뉴는 제어하지 못합니다.</p>
<details id="runtime-advanced" class="runtime-advanced"><summary>고급 옵션과 실행 기록 보기</summary>
<div class="runtime-limit"><strong>페이지 보호 모드는 개발자도구를 닫는 기능이 아닙니다.</strong><p>검사 단축키나 도킹 크기 추정 신호에 반응해 페이지에 차단 안내를 표시합니다. 분리된 도구는 놓칠 수 있고 창 테두리·확대 설정으로 오탐할 수 있습니다. DOM·백그라운드 작업·콘솔 실행·서버 권한은 통제하지 못합니다. 새로고침하면 초기 설정으로 돌아갑니다.</p></div>
<div class="lab-actions"><button id="runtime-enable" class="primary">입력 제한 켜기</button><button id="runtime-disable" class="sample-run">입력 제한 끄기</button><button id="runtime-tour" class="sample-run">전체 기능 체험 시작</button></div><p id="runtime-tour-status" aria-live="polite">입력 제한·정책 스위치 → 배포 호환성·파일 검사 → 삽입·변조 5종 → High 난독화를 시작합니다. 실제 키 입력은 위 영역에서 직접 시험하세요.</p>
<div class="runtime-grid"><article class="sample-card"><h3>SDK 설정</h3><div class="toggles">
<label><input id="runtime-detect" type="checkbox" checked> 창 크기 추정 감지</label><label><input id="runtime-warn" type="checkbox"> SDK 경고를 콘솔에도 출력</label><label><input id="sdk-integrity" type="checkbox" checked> 명시적 SDK 파일 검사 허용</label><label for="runtime-threshold">감지 기준 차이 (픽셀)<input id="runtime-threshold" type="number" min="40" max="1000" step="1" value="160"></label></div><p id="runtime-config-error" aria-live="polite"></p><details><summary>지금 적용된 update 코드</summary><pre id="runtime-config"></pre></details><p id="detection">감지된 추정 신호 없음 · 실제 개발자도구 열림 상태는 판정하지 않습니다.</p></article>
<article class="sample-card"><h3>편집·합성 이벤트 비교</h3><label for="runtime-editor">편집 허용 시험 입력</label><input id="runtime-editor" placeholder="기본 모드에서는 편집 영역의 단축키·우클릭을 허용합니다."><div class="lab-actions"><button id="test-f12" class="sample-run">F12 시험 이벤트 실행</button><button id="test-mac-inspect" class="sample-run">⌘+⌥+I 시험 이벤트 실행</button><button id="test-menu" class="sample-run">우클릭 시험 이벤트 실행</button></div><p id="live-result" aria-live="polite">옵션을 바꾸고 시험 이벤트를 실행해 보세요.</p><p>합성 이벤트는 SDK의 이벤트 취소만 시험합니다. 실제 개발자도구 열림 여부를 검사하지 않습니다.</p></article>
<article class="sample-card"><div class="lab-actions"><h3>로컬 이벤트 기록</h3><button id="runtime-clear" class="text-button">기록 지우기</button></div><ul id="runtime-log" class="runtime-log" aria-live="polite" aria-label="로컬 이벤트 기록"></ul><p>최근 20건만 이 화면에 기록합니다. 입력 내용은 수집하지 않고 기록을 서버로 보내지 않습니다.</p></article></div></details></section>`;
export const sdkIntegrityMarkup = `<section id="sdk-file" class="demo-section integrity-demo" aria-labelledby="integrity-heading"><div class="section-heading"><div><h3 id="integrity-heading">SDK로 실제 파일을 검사하세요.</h3><p>보호된 예제 파일을 checkIntegrity()로 읽고, 정상 해시와 한 글자 다른 기대 해시를 비교합니다.</p></div></div><button id="runtime-integrity" class="primary">SDK 파일 검사</button><pre id="runtime-integrity-result" class="lab-result" aria-live="polite">아직 검사하지 않았습니다.</pre><p class="lab-limit">공개 manifest를 기준으로 한 SDK 검사 체험입니다. 변조한 파일을 배포하거나 실행하지 않습니다. 신뢰할 수 있는 기준 해시의 배포는 별도 책임입니다.</p><a href="#sdk-integrity">SDK 검사 허용 옵션 확인</a></section>`;
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
    "shortcut-unavailable": "브라우저가 취소를 허용하지 않은 검사 단축키",
    "context-menu-blocked": "SDK 우클릭 제한 이벤트",
    "context-menu-unavailable": "브라우저가 취소를 허용하지 않은 우클릭 이벤트",
    "devtools-heuristic": "창 크기 추정 신호 · 오탐 가능",
    "integrity-mismatch": "SDK 무결성 불일치 이벤트",
    "integrity-error": "SDK 파일 읽기·검사 오류",
    "page-blocked": "페이지 보호 안내 표시 · 개발자도구 강제 닫기 아님",
    "page-unblocked": "페이지 보호 안내 해제",
    "page-block-unavailable":
      "이 브라우저에서 페이지 보호 안내를 표시할 수 없음",
  };
  const message = names[event.type] ?? "SDK 알림";
  log(message);
  if (event.type === "page-blocked") {
    const dialog = document.querySelector("[data-webguard-blocker]");
    if (dialog && !dialog.querySelector("[data-demo-block-exit]")) {
      const exit = document.createElement("button");
      exit.type = "button";
      exit.setAttribute("data-demo-block-exit", "");
      exit.textContent = "이 데모의 보호 모드 끄기";
      exit.addEventListener("click", () => {
        const mode = get<HTMLInputElement>("runtime-page-block");
        mode.checked = false;
        mode.dispatchEvent(new Event("change", { bubbles: true }));
      });
      Object.assign(exit.style, {
        display: "block",
        marginTop: "16px",
        minHeight: "44px",
        padding: "10px 16px",
        border: "1px solid #cadbf5",
        borderRadius: "12px",
        background: "#fff",
        color: "#315a91",
        font: "inherit",
        cursor: "pointer",
      });
      (dialog.querySelector("section") ?? dialog).append(exit);
    }
  }
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
    let threshold = get<HTMLInputElement>("runtime-threshold").valueAsNumber;
    if (!Number.isInteger(threshold) || threshold < 40 || threshold > 1000) {
      if (
        !check("runtime-page-block") &&
        guard.getOptions().devtools?.response === "block"
      ) {
        // Invalid advanced input must never strand the demo inside its modal.
        threshold = guard.getOptions().devtools?.threshold ?? 160;
        get<HTMLInputElement>("runtime-threshold").value = String(threshold);
      } else {
        get<HTMLInputElement>("runtime-page-block").checked =
          guard.getOptions().devtools?.response === "block";
        get("runtime-config-error").textContent =
          "감지 기준은 40~1000 사이 정수로 입력하세요. 기존 설정을 유지합니다.";
        return;
      }
    }
    const pageBlock = check("runtime-page-block");
    for (const id of ["runtime-detect", "shortcuts", "runtime-warn"]) {
      const control = get<HTMLInputElement>(id);
      control.disabled = pageBlock;
      if (pageBlock && id !== "runtime-warn") control.checked = true;
    }
    revision++;
    if (checking) guard.update({ integrity: { enabled: false } });
    guard.update({
      devtools: {
        detect: check("runtime-detect"),
        blockShortcuts: check("shortcuts"),
        blockContextMenu: check("context"),
        response: pageBlock
          ? "block"
          : check("runtime-warn")
            ? "warn"
            : "monitor",
        shortcutScope: pageBlock ? "page" : "non-editable",
        threshold,
      },
      integrity: { enabled: check("sdk-integrity") },
    });
    get("runtime-config-error").textContent = "";
    const options = guard.getOptions();
    get("runtime-state").textContent =
      `현재 적용: 페이지 보호 모드 ${pageBlock ? "ON · 페이지 안내로 사용 제한" : "OFF"} · 단축키 ${options.devtools?.blockShortcuts ? "ON (⌘+⌥+I/J/C · Ctrl+Shift+I/J/C · F12)" : "OFF (스위치를 켜야 제한됩니다)"} · 우클릭 ${options.devtools?.blockContextMenu ? "ON" : "OFF"}`;
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
    "runtime-page-block",
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
        if (!enabled)
          get<HTMLInputElement>("runtime-page-block").checked = false;
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
      const inspectKey =
        ["i", "j", "c"].includes(key) ||
        ["KeyI", "KeyJ", "KeyC"].includes(event.code);
      if (
        key !== "f12" &&
        !(
          inspectKey &&
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
  get("test-mac-inspect").addEventListener("click", () =>
    synthetic(
      new KeyboardEvent("keydown", {
        key: "Dead",
        code: "KeyI",
        metaKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
      "⌘+⌥+I (Option 문자 변환)",
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
