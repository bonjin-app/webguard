interface DownloadArtifact {
  url: string;
  sha256: string;
  bytes: number;
}
export interface DownloadRelease {
  id: string;
  version: string;
  channel: "unpublished-candidate";
  sdk: DownloadArtifact & { download: string; integrity: string };
  package: DownloadArtifact & { sha512: string };
  example: DownloadArtifact;
  licenses: DownloadArtifact;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("다운로드 목록의 형식이 올바르지 않습니다.");
  return value as Record<string, unknown>;
}
export function parseDownloadCatalog(value: unknown): DownloadRelease {
  const catalog = record(value);
  const current = record(catalog.current);
  if (
    catalog.version !== 1 ||
    current.version !== "0.3.0" ||
    current.channel !== "unpublished-candidate" ||
    typeof current.id !== "string" ||
    !/^0\.3\.0-[a-f0-9]{16}$/.test(current.id)
  )
    throw new Error("지원하지 않는 다운로드 목록입니다.");
  const id = current.id;
  for (const [key, expected] of Object.entries({
    sdk: `/cdn/releases/${id}/webguard.global.js`,
    package: `/downloads/releases/${id}/uulab-webguard-0.3.0.tgz`,
    example: `/downloads/releases/${id}/webguard-init.js`,
    licenses: `/downloads/releases/${id}/THIRD_PARTY_NOTICES.txt`,
  })) {
    const item = record(current[key]);
    if (
      item.url !== expected ||
      typeof item.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      !Number.isSafeInteger(item.bytes) ||
      (item.bytes as number) <= 0
    )
      throw new Error("다운로드 파일 정보가 올바르지 않습니다.");
  }
  const sdk = record(current.sdk),
    pkg = record(current.package);
  if (
    sdk.download !== `/downloads/releases/${id}/webguard.global.js` ||
    typeof sdk.integrity !== "string" ||
    !/^sha384-[A-Za-z0-9+/]{64}$/.test(sdk.integrity) ||
    typeof pkg.sha512 !== "string" ||
    !/^[a-f0-9]{128}$/.test(pkg.sha512)
  )
    throw new Error("다운로드 해시 정보가 올바르지 않습니다.");
  return current as unknown as DownloadRelease;
}

export const downloadsMarkup = `<section id="sdk-downloads" class="sdk-downloads" aria-labelledby="downloads-heading">
<div class="download-heading"><p class="download-eyebrow">직접 다운로드 · CDN</p><h2 id="downloads-heading">내 환경에 맞게 가져가세요.</h2><p>독립 SDK는 파일 또는 고정 CDN 주소로, 빌드 도구는 로컬 패키지로 연결합니다. 0.3.0 후보의 npm 게시는 보류 중입니다.</p></div>
<p data-download-status role="status" aria-live="polite">다운로드 목록을 불러오는 중…</p><button data-download-retry type="button" hidden>목록 다시 불러오기</button>
<div data-download-ready hidden><div class="download-grid"><article><h3>브라우저 SDK</h3><p>단축키·우클릭 등 선택한 런타임 가드만 연결합니다. 내 앱의 난독화는 빌드 도구로 별도 적용하세요.</p><a data-download-sdk download>SDK 파일 다운로드</a><p data-download-sdk-size class="download-meta"></p><a data-download-example download>외부 초기화 예제 다운로드</a></article><article><h3>빌드 도구 포함 패키지</h3><p>CLI·Vite·Next 연결과 SDK를 포함한 미게시 후보입니다. Node.js 22.12 이상과 의존성 설치용 네트워크가 필요합니다.</p><a data-download-package download>로컬 패키지 .tgz 다운로드</a><p data-download-package-size class="download-meta"></p><pre><code>npm install -D ./uulab-webguard-0.3.0.tgz</code></pre></article></div>
<details class="download-cdn"><summary>고정 CDN 주소로 SDK 연결하기</summary><p>초기화 예제를 내려받아 내 서버의 <code>/assets/webguard-init.js</code>에 저장하고 옵션을 검토하세요. 아래 두 외부 스크립트를 이 순서로 앱 스크립트보다 앞에 배치합니다.</p><pre tabindex="0" aria-label="고정 CDN SDK 연결 코드"><code data-cdn-code></code></pre><button data-download-copy type="button">CDN 연결 코드 복사</button><p>CDN SDK는 런타임 가드만 제공합니다. 앱 코드를 자동 난독화하거나 서버 CSP·권한 검증을 대신하지 않습니다. 기존 CSP에 이 CDN 출처와 내 초기화 파일을 허용하고 실제 배포에서 확인하세요.</p><p>고정 릴리스 주소와 SRI는 해당 바이트를 선택합니다. 업데이트할 때 주소·SRI를 함께 바꾸고, 다운로드 목록의 해시와 대조하세요.</p></details>
<details class="download-hashes"><summary>파일 해시와 라이선스 확인</summary><p data-download-release class="download-meta"></p><pre data-download-hashes tabindex="0" aria-label="다운로드 파일 SHA-256"></pre><a data-download-licenses download>서드파티 라이선스 다운로드</a><p>해시는 파일 바이트 비교용입니다. 이 사이트의 목록 자체를 별도 신뢰 기준으로 인증하는 기능은 아닙니다.</p></details></div>
<noscript>다운로드 목록을 표시하려면 JavaScript를 켜거나 <a href="/downloads/catalog.json">다운로드 목록 JSON</a>에서 고정 파일 주소와 해시를 확인하세요.</noscript></section>`;

export async function initDownloads(): Promise<void> {
  const section = document.getElementById("sdk-downloads");
  if (!section || section.dataset.loading === "true") return;
  const get = <T extends HTMLElement>(name: string) =>
    section.querySelector<T>(`[data-download-${name}]`)!;
  const status = get("status"),
    retry = get<HTMLButtonElement>("retry"),
    ready = get("ready");
  retry.onclick = () => {
    void initDownloads();
  };
  section.dataset.loading = "true";
  ready.hidden = true;
  retry.hidden = true;
  status.textContent = "다운로드 목록을 불러오는 중…";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("/downloads/catalog.json", {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("목록 요청에 실패했습니다.");
    const release = parseDownloadCatalog(await response.json());
    for (const [name, path] of Object.entries({
      sdk: release.sdk.download,
      package: release.package.url,
      example: release.example.url,
      licenses: release.licenses.url,
    })) {
      const anchor = get<HTMLAnchorElement>(name);
      anchor.setAttribute("href", path);
      anchor.download = path.split("/").at(-1)!;
    }
    get("sdk-size").textContent =
      `${release.sdk.bytes.toLocaleString()} 바이트 · 미게시 후보 ${release.version}`;
    get("package-size").textContent =
      `${release.package.bytes.toLocaleString()} 바이트 · 의존성은 설치 시 별도 다운로드`;
    get("release").textContent = `고정 릴리스 ${release.id} · npm 미게시 후보`;
    get("hashes").textContent = [
      `SDK SHA-256: ${release.sdk.sha256}`,
      `패키지 SHA-256: ${release.package.sha256}`,
      `패키지 SHA-512: ${release.package.sha512}`,
      `초기화 예제 SHA-256: ${release.example.sha256}`,
      `라이선스 SHA-256: ${release.licenses.sha256}`,
    ].join("\n");
    const snippet = `<script defer src="https://webguard.uulab.co.kr${release.sdk.url}" integrity="${release.sdk.integrity}" crossorigin="anonymous"></script>\n<script defer src="/assets/webguard-init.js"></script>`;
    section.querySelector("[data-cdn-code]")!.textContent = snippet;
    get<HTMLButtonElement>("copy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(snippet);
        status.textContent = "CDN 연결 코드를 복사했습니다.";
      } catch {
        status.textContent =
          "클립보드를 사용할 수 없습니다. 위 연결 코드를 선택해 직접 복사하세요.";
      }
    };
    ready.hidden = false;
    status.textContent = `0.3.0 npm 미게시 후보 · 다운로드 준비 완료 · ${release.id}`;
  } catch {
    status.textContent =
      "다운로드 목록을 불러올 수 없습니다. 연결 상태를 확인하고 다시 시도하세요.";
    retry.hidden = false;
  } finally {
    clearTimeout(timer);
    delete section.dataset.loading;
  }
}
