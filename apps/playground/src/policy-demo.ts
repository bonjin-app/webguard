export const policyMarkup = `<section id="policy-lab" class="demo-section" aria-labelledby="policy-heading"><div class="section-heading"><div><h2 id="policy-heading">정책을 켜고 끄며 비교하세요</h2><p>고정된 안전한 시험을 새 격리 프레임에서 실행합니다. 이 선택은 본문 페이지나 서버의 보안 설정을 바꾸지 않습니다.</p></div></div><div class="sample-card"><div class="lab-actions"><label><input id="policy-network" type="checkbox" checked> 네트워크 전송 제한</label><label><input id="policy-dom" type="checkbox" checked> DOM 문자열 삽입 제한</label><label><input id="policy-inline" type="checkbox" checked> 인라인 스크립트 제한</label></div><div class="lab-actions"><button id="policy-enable-all" class="text-button">정책 모두 켜기</button><button id="policy-disable-all" class="text-button">정책 모두 끄기</button><button id="policy-run" class="sample-run">선택 정책 비교 실행</button></div><p id="policy-summary" role="status" aria-live="polite">실행 전 · 정책을 선택한 뒤 비교하세요.</p><div class="sample-grid"><article><h3>정책 적용 전 · 모두 끔</h3><pre id="policy-before" class="lab-result">아직 실행하지 않았습니다.</pre></article><article><h3>선택 정책 적용 후</h3><pre id="policy-after" class="lab-result">아직 실행하지 않았습니다.</pre></article></div><p class="lab-limit">네트워크는 인증 정보 없이 고정 데모 API만 읽습니다. DOM은 무해한 고정 span만 삽입하며 Trusted Types 미지원은 차단 성공으로 세지 않습니다. 인라인은 고정 parser script로 시험합니다. HTML 정화·서버 권한 검사를 대신하지 않습니다.</p></div></section>`;

type Settings = { network: boolean; dom: boolean; inline: boolean };
type Outcome = "allowed" | "blocked" | "failed" | "unsupported";
interface Result {
  network: Outcome;
  dom: Outcome;
  inline: Outcome;
  trustedTypes: boolean;
  violations: string[];
}
const outcomes = new Set(["allowed", "blocked", "failed", "unsupported"]);
function validResult(value: unknown): value is Result {
  if (!value || typeof value !== "object") return false;
  const result = value as Result;
  return (
    [result.network, result.dom, result.inline].every((item) =>
      outcomes.has(item),
    ) &&
    typeof result.trustedTypes === "boolean" &&
    Array.isArray(result.violations) &&
    result.violations.length <= 20 &&
    result.violations.every(
      (item) => typeof item === "string" && item.length <= 100,
    )
  );
}
async function compare(
  settings: Settings,
  host: HTMLElement,
  signal: AbortSignal,
): Promise<Result> {
  const token = crypto.randomUUID();
  const endpoint = new URL("/api/demo/network-probe", location.origin);
  // The only executable text and network target are fixed teaching fixtures.
  const bootstrap = `const violations=[];
addEventListener('securitypolicyviolation',event=>{if(event.disposition==='enforce'&&violations.length<20)violations.push(event.effectiveDirective);});
addEventListener('DOMContentLoaded',async()=>{
const supported=typeof globalThis.trustedTypes?.createPolicy==='function';
const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),2500);
let network='failed',dom='failed',domError='';
try{const response=await fetch(${JSON.stringify(endpoint.href)},{credentials:'omit',cache:'no-store',signal:controller.signal});const body=await response.json();if(response.ok&&body?.probe==='webguard-network-ok')network='allowed';}catch{}finally{clearTimeout(timer);controller.abort();}
const target=document.createElement('div');document.body.append(target);
try{target.innerHTML='<span data-policy-probe>fixed text</span>';if(target.querySelector('[data-policy-probe]')?.textContent==='fixed text')dom='allowed';}catch(error){domError=error?.name;}
setTimeout(()=>{
if(network==='failed'&&violations.includes('connect-src'))network='blocked';
if(${settings.dom}&&!supported)dom='unsupported';
else if(domError==='TypeError'&&violations.includes('require-trusted-types-for'))dom='blocked';
const inline=globalThis.policyInlineRan===true?'allowed':violations.some(item=>item==='script-src-elem'||item==='script-src')?'blocked':'failed';
parent.postMessage({type:'webguard-policy-result',token:${JSON.stringify(token)},result:{network,dom,inline,trustedTypes:supported,violations}},'*');
},100);
},{once:true});`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(bootstrap),
  );
  if (signal.aborted) throw new Error("시험이 중단되었습니다.");
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const policy = `default-src 'none'; base-uri 'none'; form-action 'none'; script-src ${settings.inline ? `'sha256-${hash}'` : "'unsafe-inline'"}; connect-src ${settings.network ? "'none'" : endpoint.origin}${settings.dom ? "; require-trusted-types-for 'script'; trusted-types 'none'" : ""}`;
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = "정책 비교 격리 시험";
    frame.sandbox.add("allow-scripts");
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      signal.removeEventListener("abort", cancel);
      frame.remove();
    };
    const cancel = () => {
      cleanup();
      reject(new Error("시험이 중단되었습니다."));
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== "null")
        return;
      const data = event.data;
      if (
        !data ||
        data.type !== "webguard-policy-result" ||
        data.token !== token ||
        !validResult(data.result)
      )
        return;
      cleanup();
      resolve(data.result);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("시험 응답 시간 초과 · 확인 실패"));
    }, 5000);
    signal.addEventListener("abort", cancel, { once: true });
    window.addEventListener("message", receive);
    // SHA-256 hashes these exact bootstrap bytes; the separate parser script is the inline probe.
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><body><script>${bootstrap}</script><script>globalThis.policyInlineRan=true;</script></body>`;
    host.append(frame);
  });
}
const labels: Record<Outcome, string> = {
  allowed: "허용",
  blocked: "차단",
  failed: "확인 실패",
  unsupported: "미지원 (차단 성공으로 계산하지 않음)",
};
function describe(result: Result): string {
  return `네트워크: ${labels[result.network]}\nDOM: ${labels[result.dom]}\n인라인: ${labels[result.inline]}\nTrusted Types: ${result.trustedTypes ? "지원" : "미지원"}\n관측 정책: ${result.violations.join(", ") || "없음"}`;
}
export function initPolicyDemo(): () => void {
  const root = document.getElementById("policy-lab");
  if (!root) return () => {};
  const get = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#policy-${id}`)!;
  const toggles = {
    network: get<HTMLInputElement>("network"),
    dom: get<HTMLInputElement>("dom"),
    inline: get<HTMLInputElement>("inline"),
  };
  const summary = get("summary"),
    before = get("before"),
    after = get("after");
  const controls = [
    ...root.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      "input,button",
    ),
  ];
  const events = new AbortController();
  let active: AbortController | undefined,
    disposed = false;
  const invalidate = () => {
    summary.textContent = "설정 변경 · 다시 실행하여 결과를 확인하세요.";
    before.textContent = after.textContent =
      "선택이 바뀌었습니다. 다시 실행하세요.";
  };
  const setAll = (value: boolean) => {
    for (const toggle of Object.values(toggles)) toggle.checked = value;
    invalidate();
  };
  for (const toggle of Object.values(toggles))
    toggle.addEventListener("change", invalidate, { signal: events.signal });
  get("enable-all").addEventListener("click", () => setAll(true), {
    signal: events.signal,
  });
  get("disable-all").addEventListener("click", () => setAll(false), {
    signal: events.signal,
  });
  const abort = () => active?.abort();
  window.addEventListener("pagehide", abort, { signal: events.signal });
  get("run").addEventListener(
    "click",
    () => {
      void (async () => {
        if (active || disposed) return;
        const controller = new AbortController();
        active = controller;
        const settings = {
          network: toggles.network.checked,
          dom: toggles.dom.checked,
          inline: toggles.inline.checked,
        };
        for (const control of controls) control.disabled = true;
        summary.textContent = "격리 프레임에서 비교 실행 중…";
        before.textContent = after.textContent = "실행 중…";
        try {
          const [baseline, selected] = await Promise.all([
            compare(
              { network: false, dom: false, inline: false },
              root,
              controller.signal,
            ),
            compare(settings, root, controller.signal),
          ]);
          if (disposed || controller.signal.aborted) return;
          before.textContent = describe(baseline);
          after.textContent = describe(selected);
          summary.textContent =
            baseline.network !== "allowed"
              ? "네트워크 확인 실패 · 적용 전 API 응답을 확인하지 못해 네트워크 차단 성공으로 판정하지 않습니다."
              : baseline.dom !== "allowed" ||
                  baseline.inline !== "allowed" ||
                  Object.values(selected).includes("failed")
                ? "확인 실패 · 관측 결과를 확인하세요."
                : "비교 완료 · 허용·차단·미지원은 위 실제 관측 결과를 확인하세요.";
        } catch (error) {
          if (!disposed) {
            summary.textContent =
              error instanceof Error ? error.message : "시험 확인 실패";
            before.textContent = after.textContent =
              "시험이 완료되지 않았습니다. 확인 실패.";
          }
        } finally {
          controller.abort();
          if (active === controller) {
            active = undefined;
            if (!disposed)
              for (const control of controls) control.disabled = false;
          }
        }
      })();
    },
    { signal: events.signal },
  );
  return () => {
    disposed = true;
    events.abort();
    abort();
  };
}
