export const compatMarkup = `<section id="compatibility-lab" class="demo-section" aria-labelledby="compat-heading">
<div class="section-heading"><div><h2 id="compat-heading">실제 배포 호환성을 확인하세요</h2><p>한글 하위 페이지의 실제 응답, UTF-8 선언, CSP 순서와 헤더, 최종 이동 주소, 고정 HTTP API를 검사합니다.</p></div><span class="badge">MULTIPAGE · UTF-8 · HTTP</span></div>
<div class="sample-card"><p>한글 페이지가 올바른 보안 정책과 함께 전달되는지 확인합니다. API 연결은 고정 데모 응답으로 검사합니다. 정책의 실제 차단 효과는 위 켜기·끄기 체험에서 비교하세요.</p><button id="compat-run" class="sample-run" type="button" aria-controls="compat-results">배포 호환성 검사</button><a class="demo-link" href="/examples/vanilla-js/about/" target="_blank" rel="noopener">하위 페이지 직접 열기</a><p>페이지 이동 후 주소와 쿼리가 유지되는지 확인합니다. 없는 하위 경로의 404는 정상적인 검사 결과입니다.</p></div>
<p id="compat-summary" aria-live="polite" data-result="idle">아직 검사하지 않았습니다.</p><ul id="compat-results" class="runtime-log" aria-label="실제 배포 호환성 검사 결과"></ul></section>`;
const pagePath = "/examples/vanilla-js/about/";
const missingPath = `${pagePath}not-a-static-page/`;
const phrase = "한글 보안 체험";
const initializers = new WeakMap<HTMLButtonElement, () => void>();
interface Tag {
  name: string;
  start: number;
  attributes: Record<string, string>;
}
// Inspect source without executing it or creating a TrustedHTML policy for fetched content.
function headTags(html: string): Tag[] {
  const tags: Tag[] = [];
  const pattern =
    /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z][a-z\d:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  let inHead = false;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    if (!match[1]) continue;
    const name = match[1].toLowerCase(),
      closing = match[0].startsWith("</");
    if (name === "body") break;
    if (name === "head") {
      if (closing) break;
      if (inHead) throw new Error("중복 head 구조");
      inHead = true;
      continue;
    }
    if (!inHead || closing) continue;
    if (["template", "noscript", "textarea", "xmp", "iframe"].includes(name))
      throw new Error("지원하지 않는 head 구조");
    const attributes: Record<string, string> = Object.create(null);
    const raw = match[0].slice(
      match[0].indexOf(match[1]) + match[1].length,
      -1,
    );
    const attribute =
      /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (let item = attribute.exec(raw); item; item = attribute.exec(raw)) {
      const key = item[1]!.toLowerCase();
      if (Object.hasOwn(attributes, key)) throw new Error("중복 HTML 속성");
      attributes[key] = item[2] ?? item[3] ?? item[4] ?? "";
    }
    tags.push({ name, start: match.index, attributes });
    if (["title", "style", "script"].includes(name)) {
      const end = new RegExp(`</${name}\\s*>`, "gi");
      end.lastIndex = pattern.lastIndex;
      const closingTag = end.exec(html);
      if (!closingTag) break;
      pattern.lastIndex = end.lastIndex;
    }
  }
  return tags;
}
function hasPolicy(policy: string): boolean {
  const directive = (name: string) =>
    policy
      .split(";")
      .map((value) => value.trim().split(/\s+/))
      .find((parts) => parts[0]?.toLowerCase() === name)
      ?.slice(1) ?? [];
  return (
    directive("script-src").includes("'self'") &&
    directive("require-trusted-types-for").includes("'script'")
  );
}
interface Observation {
  valid: boolean;
  detail: string;
}
export function initCompatDemo(): () => void {
  const button = document.querySelector<HTMLButtonElement>("#compat-run");
  const summary = document.querySelector<HTMLElement>("#compat-summary");
  const results = document.querySelector<HTMLElement>("#compat-results");
  if (!button || !summary || !results) return () => {};
  const previous = initializers.get(button);
  if (previous) return previous;
  let disposed = false,
    busy = false,
    revision = 0;
  const controllers = new Set<AbortController>();
  async function request<T>(
    path: string,
    redirect: RequestRedirect,
    inspect: (response: Response) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = window.setTimeout(() => controller.abort(), 5000);
    try {
      return await inspect(
        await fetch(path, {
          redirect,
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
        }),
      );
    } finally {
      window.clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  function row(id: string, observation: Observation) {
    const item = document.createElement("li");
    item.dataset.compatCheck = id;
    item.dataset.result = observation.valid ? "pass" : "fail";
    item.textContent = observation.detail;
    results!.append(item);
  }
  async function audit() {
    if (disposed || busy) return;
    const run = ++revision,
      active = () => !disposed && run === revision;
    busy = true;
    button!.disabled = true;
    results!.replaceChildren();
    summary!.dataset.result = "running";
    summary!.textContent = "실제 배포 응답을 확인하고 있습니다…";
    let valid = true;
    async function observe(id: string, operation: () => Promise<Observation>) {
      if (!active()) return;
      let result: Observation;
      try {
        result = await operation();
      } catch {
        result = {
          valid: false,
          detail: `${id} · 확인 실패: 네트워크·시간초과 또는 지원되지 않는 응답`,
        };
      }
      if (!active()) return;
      valid = valid && result.valid;
      row(id, result);
    }
    try {
      let documentResponse:
        | { status: number; bytes: Uint8Array; type: string; policy: string }
        | undefined;
      let text = "";
      await observe("page", async () => {
        documentResponse = await request(
          pagePath,
          "error",
          async (response) => ({
            status: response.status,
            bytes: new Uint8Array(await response.arrayBuffer()),
            type: response.headers.get("content-type") ?? "",
            policy: response.headers.get("content-security-policy") ?? "",
          }),
        );
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(
            documentResponse.bytes,
          );
        } catch {
          return {
            valid: false,
            detail: `${pagePath} · HTTP ${documentResponse.status} · UTF-8 해석 실패`,
          };
        }
        const ok =
          documentResponse.status === 200 &&
          documentResponse.type.split(";")[0]?.trim().toLowerCase() ===
            "text/html" &&
          /charset\s*=\s*["']?utf-?8\b/i.test(documentResponse.type) &&
          text.includes(phrase);
        return {
          valid: ok,
          detail: `${pagePath} · HTTP ${documentResponse.status} · ${ok ? `UTF-8 한글 확인: ${phrase}` : "UTF-8·한글·HTML 응답 확인 실패"}`,
        };
      });
      await observe("charset", async () => {
        if (!documentResponse || documentResponse.status !== 200)
          return {
            valid: false,
            detail: "문자 인코딩 순서 · HTTP 200 HTML이 없어 확인 실패",
          };
        const tags = headTags(text),
          charsets = tags.filter(
            (tag) => tag.name === "meta" && "charset" in tag.attributes,
          ),
          policies = tags.filter(
            (tag) =>
              tag.name === "meta" &&
              tag.attributes["http-equiv"]?.toLowerCase() ===
                "content-security-policy",
          );
        const firstResource = tags.find(
          (tag) =>
            ["script", "style"].includes(tag.name) ||
            (tag.name === "link" && "href" in tag.attributes) ||
            ["src", "srcset", "poster"].some((key) => key in tag.attributes),
        );
        const prefixTags = headTags(
          new TextDecoder().decode(documentResponse.bytes.subarray(0, 1024)),
        );
        const charset = charsets[0],
          policy = policies[0];
        const ok =
          charsets.length === 1 &&
          /^utf-?8$/i.test(charset?.attributes.charset ?? "") &&
          policies.length === 1 &&
          !!firstResource &&
          charset!.start < policy!.start &&
          policy!.start < firstResource.start &&
          prefixTags.some(
            (tag) =>
              tag.name === "meta" &&
              tag.start === charset!.start &&
              "charset" in tag.attributes,
          );
        return {
          valid: ok,
          detail: `원문 첫 1024바이트·정책 순서 · ${ok ? "charset → CSP → 스크립트·리소스 확인" : "charset·CSP 위치 또는 지원 구조 확인 실패"}`,
        };
      });
      await observe("policy", async () => {
        const header = documentResponse?.policy ?? "",
          metas = headTags(text).filter(
            (tag) =>
              tag.name === "meta" &&
              tag.attributes["http-equiv"]?.toLowerCase() ===
                "content-security-policy",
          );
        const ok =
          documentResponse?.status === 200 &&
          hasPolicy(header) &&
          metas.length === 1 &&
          hasPolicy(metas[0]?.attributes.content ?? "");
        return {
          valid: ok,
          detail: `HTTP CSP 헤더·메타 · ${ok ? "script-src 'self' · Trusted Types 선언 확인" : "강제 CSP·script-src self·Trusted Types 선언 확인 실패"}`,
        };
      });
      await observe("redirect", () =>
        request(
          pagePath.slice(0, -1) + "?view=demo",
          "follow",
          async (response) => {
            const bytes = new Uint8Array(await response.arrayBuffer()),
              final = new URL(response.url),
              expected = new URL(
                pagePath + "?view=demo",
                window.location.origin,
              );
            const ok =
              response.status === 200 &&
              response.redirected &&
              final.href === expected.href &&
              new TextDecoder("utf-8", { fatal: true })
                .decode(bytes)
                .includes(phrase);
            return {
              valid: ok,
              detail: `하위 페이지 이동 · HTTP ${response.status} · ${ok ? "실제 이동·최종주소·쿼리 유지 확인" : "이동·최종주소·쿼리 유지 확인 실패"}`,
            };
          },
        ),
      );
      await observe("api", () =>
        request("/api/demo/network-probe", "error", async (response) => {
          let value: unknown;
          try {
            value = await response.json();
          } catch {
            /* Unsupported response stays a failure. */
          }
          const ok =
            response.status === 200 &&
            typeof value === "object" &&
            value !== null &&
            "probe" in value &&
            value.probe === "webguard-network-ok";
          return {
            valid: ok,
            detail: `/api/demo/network-probe · HTTP ${response.status} · ${ok ? "HTTP API 연결 확인" : "고정 API 응답 확인 실패"}`,
          };
        }),
      );
      await observe("missing", () =>
        request(missingPath, "error", async (response) => {
          void response.body?.cancel().catch(() => {});
          return {
            valid: response.status === 404,
            detail: `없는 하위 페이지 · HTTP ${response.status} · ${response.status === 404 ? "SPA fallback 없이 404 확인" : "정확한 404 확인 실패"}`,
          };
        }),
      );
      if (active()) {
        summary!.dataset.result = valid ? "pass" : "fail";
        summary!.textContent = valid
          ? "검사 완료 · 실제 배포 호환성 항목 확인"
          : "검사 완료 · 확인 실패 항목이 있습니다.";
      }
    } finally {
      if (active()) {
        busy = false;
        button!.disabled = false;
      }
    }
  }
  const listener = () => {
    void audit();
  };
  const cancel = () => {
    revision++;
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
    busy = false;
    button.disabled = false;
  };
  const cleanup = () => {
    if (disposed) return;
    cancel();
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
    const running = busy;
    cancel();
    if (running) {
      summary.dataset.result = "idle";
      summary.textContent =
        "페이지 이동으로 중단했습니다. 돌아오면 다시 검사할 수 있습니다.";
    }
  };
  button.addEventListener("click", listener);
  window.addEventListener("pagehide", onPageHide);
  initializers.set(button, cleanup);
  return cleanup;
}
