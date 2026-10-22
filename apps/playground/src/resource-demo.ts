/** Browser delivery is observable; this panel checks deployment responses, not authorization. */
export const resourceMarkup = `<section id="resource-exposure" class="demo-section" aria-labelledby="resource-heading">
<div class="section-heading"><div><h2 id="resource-heading">배포 리소스가 어떻게 보이는지 확인하세요</h2><p>JS와 CSS는 브라우저 실행에 필요하므로 개발자 도구와 네트워크에서 항상 볼 수 있습니다. Strict 난독화는 읽기 어렵게 만들며, 코드 은닉이나 서버 권한을 보장하지 않습니다.</p></div><span class="badge">REAL HTTP · SHA-384</span></div>
<div class="runtime-grid"><article class="sample-card"><h3>현재 HTML의 엔트리와 SRI</h3><p>실제 모듈 스크립트의 integrity 값을 읽고, 버튼을 누르면 같은 파일을 다시 받아 SHA-384를 계산합니다. 이 HTML 자체의 신뢰성은 별도 배포·HTTPS 검증이 필요합니다.</p><pre id="resource-entry">엔트리 확인 전</pre><p id="resource-css"></p></article>
<article class="sample-card"><h3>원본·설정 파일 노출 검사</h3><p>고정된 원본·설정 경로와 실제 엔트리의 소스맵·백업(.bak·~)·압축(.gz·.br) 대체 URL을 요청합니다. HTTP 404만 비공개 확인으로 표시합니다. 200 SPA fallback, 410, 네트워크 오류는 성공으로 처리하지 않습니다.</p><button id="resource-audit" class="sample-run" type="button" aria-controls="resource-results">배포 리소스 검사</button><p>검사 중 개발자 도구 콘솔·네트워크에 표시되는 404는 의도한 비공개 경로 검사 결과입니다. 비공개 경로는 상태 코드만 확인합니다. 아래 코드 미리보기는 공개 JS 엔트리의 해시가 일치할 때만 표시합니다.</p></article></div>
<p id="resource-summary" aria-live="polite" data-result="idle">아직 검사하지 않았습니다.</p>
<div class="resource-code-panel"><h3>실제 배포된 JavaScript 미리보기</h3><p id="resource-code-note">검사 버튼을 누르면 엔트리 파일을 다시 받아 HTML의 SRI와 비교합니다. 해시가 일치한 파일의 처음 900자만 표시하며 실행하지 않습니다.</p><pre><code id="resource-code" data-result="idle">아직 파일을 검사하지 않았습니다.</code></pre><p>미리보기 모양만으로 난독화 강도를 판정하지 않습니다. 해시 일치는 이 HTML의 기준값과 내려받은 파일의 일치 여부입니다.</p></div>
<ul id="resource-results" class="runtime-log" aria-label="실제 배포 리소스 검사 결과"></ul></section>`;

const probePaths = [
  "/src/main.ts",
  "/package.json",
  "/.env",
  "/vite.config.ts",
  "/webguard-report.json",
];
const initializers = new WeakMap<HTMLButtonElement, () => void>();
interface Entry {
  path: string;
  integrity: string;
}
function entryScript(): Entry {
  const script = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src]',
  );
  if (!script) throw new Error("실제 모듈 엔트리를 찾을 수 없습니다.");
  const url = new URL(script.src, window.location.href);
  if (
    url.origin !== window.location.origin ||
    !/^\/assets\/[A-Za-z0-9_.-]+\.js$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error("같은 출처의 /assets/*.js 엔트리만 허용합니다.");
  }
  const integrity = script.getAttribute("integrity")?.trim() ?? "";
  if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity))
    throw new Error("엔트리의 SHA-384 SRI가 없거나 유효하지 않습니다.");
  return { path: url.pathname, integrity };
}

/** Mount resourceMarkup first. Returns cleanup; repeated initialization reuses its listener. */
export function initResources(): () => void {
  const button = document.querySelector<HTMLButtonElement>("#resource-audit");
  const summary = document.querySelector<HTMLElement>("#resource-summary");
  const results = document.querySelector<HTMLElement>("#resource-results");
  const entryLabel = document.querySelector<HTMLElement>("#resource-entry");
  const cssLabel = document.querySelector<HTMLElement>("#resource-css");
  const preview = document.querySelector<HTMLElement>("#resource-code");
  const previewNote = document.querySelector<HTMLElement>(
    "#resource-code-note",
  );
  if (
    !button ||
    !summary ||
    !results ||
    !entryLabel ||
    !cssLabel ||
    !preview ||
    !previewNote
  )
    return () => {};
  const previous = initializers.get(button);
  if (previous) return previous;
  let busy = false,
    disposed = false;
  let revision = 0;
  const controllers = new Set<AbortController>();
  function inspectEntry(): Entry | undefined {
    try {
      const entry = entryScript();
      entryLabel!.textContent = `${entry.path}\n${entry.integrity}`;
      return entry;
    } catch (error) {
      entryLabel!.textContent =
        error instanceof Error ? error.message : "엔트리 확인 실패";
      return undefined;
    }
  }
  inspectEntry();
  const styles = [
    ...document.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"][href]',
    ),
  ].map((link) => {
    const url = new URL(link.href, window.location.href);
    return url.origin === window.location.origin &&
      /^\/assets\/[A-Za-z0-9_.-]+\.css$/.test(url.pathname)
      ? url.pathname
      : "기타 스타일 리소스";
  });
  cssLabel.textContent = `브라우저에 전달된 CSS: ${styles.join(", ") || "별도 CSS 링크 없음"}`;
  function row(path: string, detail: string, valid: boolean) {
    if (disposed) return;
    const item = document.createElement("li");
    item.dataset.resourcePath = path;
    item.dataset.result = valid ? "pass" : "fail";
    item.textContent = `${path} · ${detail}`;
    results!.append(item);
  }
  async function request<T>(
    path: string,
    inspect: (response: Response) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(path, {
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
        credentials: "same-origin",
      });
      return await inspect(response);
    } finally {
      window.clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  async function audit() {
    if (busy || disposed) return;
    const run = ++revision;
    const active = () => !disposed && run === revision;
    busy = true;
    button!.disabled = true;
    results!.replaceChildren();
    preview!.dataset.result = "running";
    preview!.textContent = "엔트리 파일 확인 중… 이전 미리보기를 지웠습니다.";
    previewNote!.textContent = "현재 HTML의 SRI와 일치한 응답만 표시합니다.";
    summary!.dataset.result = "running";
    summary!.textContent = "실제 HTTP 응답과 엔트리 해시를 검사하고 있습니다…";
    let valid = true;
    try {
      const entry = inspectEntry();
      if (!entry) {
        valid = false;
        row("엔트리", entryLabel!.textContent ?? "SRI 확인 실패", false);
      }
      for (const path of [
        ...probePaths,
        ...(entry
          ? [".map", ".bak", "~", ".gz", ".br"].map(
              (suffix) => entry.path + suffix,
            )
          : []),
      ]) {
        if (!active()) return;
        try {
          const status = await request(path, async (response) => {
            void response.body?.cancel().catch(() => {});
            return response.status;
          });
          if (!active()) return;
          const absent = status === 404;
          valid = valid && absent;
          row(
            path,
            `HTTP ${status} · ${absent ? "비공개 확인" : "확인 실패: 404가 아닌 응답"}`,
            absent,
          );
        } catch {
          if (!active()) return;
          valid = false;
          row(
            path,
            "HTTP 응답 없음 · 확인 실패: 네트워크 또는 시간초과",
            false,
          );
        }
      }
      if (entry && active()) {
        try {
          const observation = await request(entry.path, async (response) => {
            if (response.status !== 200) {
              void response.body?.cancel().catch(() => {});
              return {
                status: response.status,
                matches: false,
                bytes: 0,
                preview: "",
              };
            }
            const bytes = await response.arrayBuffer();
            const digest = new Uint8Array(
              await crypto.subtle.digest("SHA-384", bytes),
            );
            return {
              status: response.status,
              bytes: bytes.byteLength,
              preview: new TextDecoder()
                .decode(bytes.slice(0, 3600))
                .slice(0, 900),
              matches:
                `sha384-${btoa(String.fromCharCode(...digest))}` ===
                entry.integrity,
            };
          });
          if (!active()) return;
          valid = valid && observation.matches;
          if (observation.matches) {
            preview!.dataset.result = "pass";
            preview!.textContent = observation.preview;
            previewNote!.textContent = `${entry.path} · ${observation.bytes.toLocaleString()} B · SHA-384 일치 · 처음 900자 (일부 코드)`;
          }
          row(
            entry.path,
            `HTTP ${observation.status} · SHA-384 ${observation.matches ? "일치" : "불일치"}`,
            observation.matches,
          );
        } catch {
          if (!active()) return;
          valid = false;
          row(
            entry.path,
            "SHA-384 확인 실패: 네트워크·시간초과 또는 Web Crypto 사용 불가",
            false,
          );
        }
      }
      if (active()) {
        summary!.dataset.result = valid ? "pass" : "fail";
        summary!.textContent = valid
          ? "검사 완료 · 고정 경로 404 및 엔트리 SHA-384 일치 확인"
          : "검사 완료 · 확인 실패 항목이 있습니다. 실제 응답과 SRI를 확인하세요.";
      }
    } finally {
      if (active()) {
        busy = false;
        button!.disabled = false;
        if (preview!.dataset.result !== "pass") {
          preview!.dataset.result = "fail";
          preview!.textContent =
            "엔트리 해시를 확인하지 못해 코드 미리보기를 표시하지 않습니다.";
        }
      }
    }
  }
  const listener = () => {
    void audit();
  };
  const cancelRun = () => {
    revision++;
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
    busy = false;
    button.disabled = false;
  };
  const cleanup = () => {
    if (disposed) return;
    cancelRun();
    disposed = true;
    button.removeEventListener("click", listener);
    window.removeEventListener("pagehide", onPageHide);
    initializers.delete(button);
  };
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) {
      cleanup();
      return;
    }
    const wasBusy = busy;
    cancelRun();
    if (wasBusy) {
      preview.dataset.result = "idle";
      preview.textContent =
        "검사가 중단되었습니다. 다시 검사하면 새 파일을 확인합니다.";
      summary.dataset.result = "idle";
      summary.textContent =
        "페이지 이동으로 검사를 중단했습니다. 돌아오면 다시 검사할 수 있습니다.";
    }
  };
  button.addEventListener("click", listener);
  window.addEventListener("pagehide", onPageHide);
  initializers.set(button, cleanup);
  return cleanup;
}
