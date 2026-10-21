export const protectionOverviewMarkup = `
<section id="deployment-proof" class="protection-overview" aria-labelledby="proof-heading">
  <div class="proof-intro"><div class="eyebrow">PROTECTED BY WEBGUARD</div><h2 id="proof-heading">이 페이지도 보호된 빌드입니다.</h2><p>데모의 앱·SDK·실행 Worker에 Strict 난독화를 적용했습니다.<br>실제 배포 파일과 보호 전후 결과를 직접 확인하세요.</p></div>
  <div class="proof-cards">
    <article><span class="proof-step">01 · 배포 코드</span><h3>지금 실행 중인 코드로 확인</h3><p>현재 페이지의 JS를 다시 받아 해시를 비교하고, 난독화된 코드 일부와 원본·소스맵 경로의 응답을 보여줍니다.</p><a href="#resource-exposure" data-proof-run="resource-audit">이 데모 코드 검사 <span aria-hidden="true">↗</span></a></article>
    <article><span class="proof-step">02 · 보호 전후</span><h3>삽입과 변조를 직접 비교</h3><p>CSP의 스크립트·네트워크 차단, 파일 변조 탐지, 데모 서버의 가격 검증을 실행합니다. 미지원은 따로 표시합니다.</p><a href="#security-lab" data-proof-run="lab-all">삽입·변조 비교 실행 <span aria-hidden="true">↗</span></a></article>
    <article><span class="proof-step">03 · 실시간 SDK</span><h3>가드를 끄고, 다시 켜보세요</h3><p>Mac ⌘+⌥+I/J/C와 F12 입력 제한을 비교하세요. 페이지 보호 모드를 켜면 검사 단축키·도킹 크기 추정 신호에 차단 안내를 표시합니다. 개발자도구를 강제로 닫지는 않습니다.</p><a href="#live-demo">브라우저 가드 체험 <span aria-hidden="true">↗</span></a></article>
  </div>
  <p class="proof-scope">자체 앱 코드는 Strict, 대용량 외부 변환 엔진은 Standard로 빌드합니다. JS·CSS는 브라우저에 전달되며 관찰할 수 있습니다. 정책·서버 검증 예제는 SDK 단독 기능과 구분됩니다.</p>
</section>`;

/** Reuse the existing real checks; never manufacture a successful result here. */
export function initProtectionOverview() {
  const anchors =
    document.querySelectorAll<HTMLAnchorElement>("[data-proof-run]");
  const run = (event: MouseEvent) => {
    // Preserve new-tab and modifier-click navigation without starting hidden work.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    const id = (event.currentTarget as HTMLAnchorElement).dataset.proofRun;
    if (id !== "resource-audit" && id !== "lab-all") return;
    document.querySelector<HTMLButtonElement>(`#${id}`)?.click();
  };
  for (const anchor of anchors) anchor.addEventListener("click", run);
  return () => {
    for (const anchor of anchors) anchor.removeEventListener("click", run);
  };
}
