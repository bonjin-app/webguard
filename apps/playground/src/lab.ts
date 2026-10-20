const initialContent =
  'const price = 9900; console.log("WebGuard demo", price);';
export const labMarkup = `
<section id="security-lab" class="demo-section" aria-labelledby="lab-heading">
  <div class="section-heading"><div><div class="eyebrow">INTERACTIVE SECURITY LAB</div><h2 id="lab-heading">직접 바꾸고, 방어 결과를 확인하세요</h2><p>버튼을 누르면 실제 브라우저 정책·해시·서버 응답을 검사합니다. 개발자도구가 열려 있어도 체험할 수 있습니다.</p></div></div>
  <div class="lab-actions"><button id="lab-all" class="primary">전체 시나리오 실행</button><button id="lab-reset" class="text-button">체험 초기화</button><p id="lab-summary" aria-live="polite">시험을 선택하거나 전체 시나리오를 실행하세요.</p></div>
  <div class="sample-grid lab-grid">
    <article class="sample-card"><span class="badge">브라우저 정책 · 실제 실행</span><h3>01. 스크립트 삽입</h3><p>같은 시험 코드를 CSP 적용 전후에 실행합니다. 본문 페이지와 분리된 프레임에서만 동작합니다.</p><label for="lab-policy-kind">스크립트 시험 종류</label><select id="lab-policy-kind"><option value="inline">인라인 스크립트 삽입</option><option value="eval">eval 문자열 실행</option><option value="handler">HTML 이벤트 핸들러 삽입</option></select><pre class="lab-payload" id="lab-policy-payload"></pre><button id="lab-policy" class="sample-run">스크립트 삽입 비교</button><pre id="lab-policy-result" class="lab-result" aria-live="polite">아직 실행하지 않았습니다.</pre><p class="lab-limit">CSP 메타 정책을 사용하는 격리 체험입니다. 콘솔·브라우저 디버거의 실행을 차단하는 기능은 아닙니다.</p></article>
    <article class="sample-card"><span class="badge">SHA-384 · 로컬 검사</span><h3>02. 파일 변조 탐지</h3><p>기준 파일의 해시와 비교합니다. 아래 내용을 한 글자라도 바꾸고 다시 검사해 보세요.</p><label for="lab-file">검사할 파일 내용</label><textarea id="lab-file" spellcheck="false"></textarea><div class="lab-actions"><button id="lab-tamper" class="text-button">가격을 100원으로 변조</button><button id="lab-integrity" class="sample-run">파일 변조 검사</button></div><pre id="lab-integrity-result" class="lab-result" aria-live="polite">아직 실행하지 않았습니다.</pre><p class="lab-limit">이 해시 비교는 로컬 탐지 시연입니다. 실제 SRI는 신뢰할 수 있는 HTML의 기준 해시를 브라우저가 검증해야 합니다.</p></article>
    <article class="sample-card"><span class="badge">데모 서버 · 실제 HTTP</span><h3>03. 가격 요청 변조</h3><p>서버 기준 가격은 9,900원입니다. 클라이언트 가격을 바꿔 전송해도 서버는 기준 가격으로 다시 계산합니다.</p><label for="lab-price">서버에 보낼 가격</label><input id="lab-price" type="number" min="0" max="999999" step="1" value="100"><pre id="lab-api-payload" class="lab-payload"></pre><button id="lab-api" class="sample-run">가격 요청 비교</button><pre id="lab-api-result" class="lab-result" aria-live="polite">아직 실행하지 않았습니다.</pre><p class="lab-limit">샘플 JSON만 서버로 보냅니다. 저장·결제는 없습니다. 서버 검증 예제이며 SDK의 자동 권한 방어 기능이 아닙니다.</p></article>
  </div><div id="lab-frames" hidden></div>
  <p class="lab-note">난독화는 아래에서 원본과 실행 결과를 비교하고, F12·우클릭 제한은 <a href="#live-demo">실시간 SDK 체험</a>에서 켜고 끌 수 있습니다. 각 시험의 성공은 해당 시나리오에 대한 결과입니다.</p>
</section>`;
const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const payloads = {
  inline:
    "const script = document.createElement('script');\nscript.textContent = 'globalThis.labExecuted = true';\ndocument.body.append(script);",
  eval: "eval('globalThis.labExecuted = true');",
  handler:
    "const button = document.createElement('button');\nbutton.setAttribute('onclick', 'globalThis.labExecuted = true');\ndocument.body.append(button); button.click();",
};
type Kind = keyof typeof payloads;
type Probe = { executed: boolean; violations: string[]; error?: string };
async function hash(content: string) {
  const digest = await crypto.subtle.digest(
    "SHA-384",
    new TextEncoder().encode(content),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function probe(kind: Kind, protectedMode: boolean): Promise<Probe> {
  const token = crypto.randomUUID();
  // Only fixed teaching payloads are used. Never interpolate user-supplied source here.
  const code = `const violations = []; addEventListener('securitypolicyviolation', event => violations.push(event.effectiveDirective));
let error; globalThis.labExecuted = false;
try { ${payloads[kind]} } catch (caught) { error = caught.name; }
setTimeout(() => parent.postMessage({type:'webguard-lab', token:${JSON.stringify(token)}, executed:globalThis.labExecuted === true, violations, error}, '*'), 150);`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  const encoded = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const policy = `default-src 'none'; base-uri 'none'; form-action 'none'; script-src ${protectedMode ? `'sha256-${encoded}'` : "'unsafe-inline' 'unsafe-eval'"}`;
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.title = "WebGuard isolated policy probe";
    frame.sandbox.add("allow-scripts");
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      frame.remove();
    };
    const receive = (event: MessageEvent) => {
      const value = event.data;
      if (
        event.source !== frame.contentWindow ||
        event.origin !== "null" ||
        !value ||
        value.type !== "webguard-lab" ||
        value.token !== token ||
        typeof value.executed !== "boolean" ||
        !Array.isArray(value.violations) ||
        !value.violations.every((entry: unknown) => typeof entry === "string")
      )
        return;
      cleanup();
      resolve(value);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "브라우저 정책 시험 응답이 없습니다. 차단 성공으로 판정하지 않습니다.",
        ),
      );
    }, 5000);
    window.addEventListener("message", receive);
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><body><script>${code}</script>`;
    byId("lab-frames").append(frame);
  });
}
export function initLab() {
  const file = byId<HTMLTextAreaElement>("lab-file");
  const price = byId<HTMLInputElement>("lab-price");
  const kind = byId<HTMLSelectElement>("lab-policy-kind");
  const summary = byId("lab-summary");
  let busy = false;
  const updatePayloads = () => {
    byId("lab-policy-payload").textContent = payloads[kind.value as Kind];
    byId("lab-api-payload").textContent = JSON.stringify(
      { sku: "course", quantity: 1, claimedTotal: price.valueAsNumber },
      null,
      2,
    );
  };
  const reset = () => {
    file.value = initialContent;
    price.value = "100";
    kind.value = "inline";
    for (const id of ["policy", "integrity", "api"])
      byId(`lab-${id}-result`).textContent = "아직 실행하지 않았습니다.";
    summary.textContent = "시험을 선택하거나 전체 시나리오를 실행하세요.";
    updatePayloads();
  };
  const checks = {
    policy: async () => {
      const selected = kind.value as Kind;
      const before = await probe(selected, false);
      const after = await probe(selected, true);
      const confirmed =
        before.executed &&
        !after.executed &&
        (after.violations.some((value) => value.startsWith("script-src")) ||
          (selected === "eval" && after.error === "EvalError"));
      byId("lab-policy-result").textContent =
        `보호 전: ${before.executed ? "실행됨" : "실행 확인 실패"}\n보호 적용: ${confirmed ? "차단 확인" : "확인 불가"}\n브라우저 위반 이벤트: ${after.violations.join(", ") || "없음"}\n실행 예외: ${after.error || "없음"}\n정책: script-src 'sha256-…' (시험 부트스트랩만 허용)`;
      return confirmed;
    },
    integrity: async () => {
      const baseline = await hash(initialContent);
      const current = await hash(file.value);
      const tampered = await hash(initialContent.replace("9900", "100"));
      byId("lab-integrity-result").textContent =
        `원본: ${(await hash(initialContent)) === baseline ? "일치" : "불일치"}\n변조본: ${tampered !== baseline ? "불일치" : "일치"}\n입력 내용: ${current === baseline ? "일치 · 기준 파일과 동일" : "불일치 · 변경 탐지"}\n기준 SHA-384: ${baseline}\n입력 SHA-384: ${current}`;
      return tampered !== baseline;
    },
    api: async () => {
      if (
        price.valueAsNumber < 0 ||
        price.valueAsNumber > 999999 ||
        !price.value ||
        !Number.isSafeInteger(price.valueAsNumber)
      )
        throw new Error("0~999999 사이 정수 가격을 입력하세요.");
      const send = async (claimedTotal: number) => {
        const response = await fetch("/api/demo/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sku: "course", quantity: 1, claimedTotal }),
          signal: AbortSignal.timeout(8000),
          credentials: "omit",
        });
        const body = (await response.json()) as {
          accepted?: boolean;
          total?: number;
          reason?: string;
          error?: string;
        };
        return { status: response.status, body };
      };
      const normal = await send(9900);
      const input = await send(price.valueAsNumber);
      const validBaseline =
        normal.status === 200 &&
        normal.body.accepted === true &&
        normal.body.total === 9900;
      const mismatch = price.valueAsNumber !== 9900;
      const verified =
        validBaseline &&
        input.body.total === 9900 &&
        (mismatch
          ? input.status === 409 && input.body.accepted === false
          : input.status === 200 && input.body.accepted === true);
      byId("lab-api-result").textContent =
        `정상 요청: HTTP ${normal.status}\n${mismatch ? "변조 요청" : "입력 요청"}: HTTP ${input.status}\n서버 계산 가격: ${input.body.total?.toLocaleString() ?? "확인 불가"}원\n${verified ? (mismatch ? "검증 확인 · 변조 가격 거부" : "검증 확인 · 정상 가격 허용") : "검증 실패 · 차단 성공으로 판정하지 않음"}\n${input.body.error ?? input.body.reason ?? "응답 내용 확인 불가"}`;
      return verified;
    },
  };
  async function run(ids: (keyof typeof checks)[]) {
    if (busy) return;
    busy = true;
    const controls = document.querySelectorAll<
      | HTMLButtonElement
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
    >(
      "#security-lab button, #security-lab input, #security-lab select, #security-lab textarea",
    );
    controls.forEach((control) => {
      control.disabled = true;
    });
    let confirmed = 0;
    summary.textContent = "실제 시험 진행 중…";
    try {
      for (const id of ids) {
        byId(`lab-${id}-result`).textContent = "시험 중…";
        try {
          if (await checks[id]()) confirmed++;
        } catch (error) {
          byId(`lab-${id}-result`).textContent =
            `시험 실패: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      summary.textContent = `${ids.length}개 체험 완료 · ${confirmed}개 검증 확인${confirmed < ids.length ? " · 실패 또는 확인 불가 결과를 확인하세요." : ""}`;
    } finally {
      busy = false;
      controls.forEach((control) => {
        control.disabled = false;
      });
    }
  }
  for (const id of ["policy", "integrity", "api"] as const)
    byId(`lab-${id}`).addEventListener("click", () => void run([id]));
  byId("lab-all").addEventListener(
    "click",
    () => void run(["policy", "integrity", "api"]),
  );
  byId("lab-reset").addEventListener("click", reset);
  byId("lab-tamper").addEventListener("click", () => {
    file.value = initialContent.replace("9900", "100");
    void run(["integrity"]);
  });
  kind.addEventListener("change", () => {
    byId("lab-policy-result").textContent = "종류 변경 · 다시 실행하세요.";
    updatePayloads();
  });
  price.addEventListener("input", () => {
    byId("lab-api-result").textContent = "가격 변경 · 다시 실행하세요.";
    updatePayloads();
  });
  file.addEventListener("input", () => {
    byId("lab-integrity-result").textContent = "내용 변경 · 다시 검사하세요.";
  });
  reset();
}
