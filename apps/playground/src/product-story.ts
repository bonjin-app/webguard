/** Product claims describe implemented candidate behavior and link to its actual checks. */
export const productStoryMarkup = `
<section id="sdk-strengths" class="sdk-strengths" aria-labelledby="strengths-heading">
  <div class="product-section-heading"><div class="eyebrow">BUILT FOR YOUR WEB APP</div><h2 id="strengths-heading">코드를 보호하는 도구에서,<br>배포를 확인하는 흐름까지.</h2><p>WebGuard는 빌드 도구와 브라우저 SDK를 함께 제공합니다.<br>보호를 적용하고, 실제 결과까지 확인할 수 있도록 연결합니다.</p></div>
  <div class="strength-grid">
    <article><span class="strength-label">01 · CODE</span><h3>분석 비용을 높이는<br>Strict / High 난독화</h3><p>식별자·문자열·제어 흐름을 변환합니다. RC4 문자열 인코딩, 문자열 분할과 함수 래퍼를 적용하고 공개 소스맵을 제거합니다.</p><p class="strength-detail">코드는 브라우저에서 실행되며 문자열도 복원됩니다. 코드의 비밀 보관이 아니라 분석을 어렵게 하는 기능입니다.</p><a href="#try-examples">원본·난독화 결과 비교 <span aria-hidden="true">↗</span></a></article>
    <article><span class="strength-label">02 · POLICY</span><h3>브라우저가 적용하는<br>SRI·CSP 정책</h3><p>빌드 결과에 SRI 해시와 초기 CSP 메타를 연결합니다. 허용할 스크립트·연결 출처를 정하고, 지원 브라우저의 Trusted Types 정책을 선택합니다.</p><p class="strength-detail">HTTP 전용 정책과 비공개 경로 제한은 호스트에도 적용해야 합니다. 기존 앱의 HTML 삽입·외부 API 호환성을 확인하세요.</p><a href="#policy-lab">실제 정책의 보호 전후 비교 <span aria-hidden="true">↗</span></a></article>
    <article><span class="strength-label">03 · RUNTIME</span><h3>새로고침 없이 바꾸는<br>브라우저 가드</h3><p>Mac·Windows 검사 단축키와 본문 우클릭 제한, 페이지 보호 안내를 실행 중에 바꿉니다. 로컬 이벤트 콜백으로 실제 반응을 확인합니다.</p><p class="strength-detail">페이지에 전달된 취소 가능한 입력에 적용됩니다. 개발자도구 창 자체나 콘솔 실행을 제어하지 않습니다.</p><a href="#live-demo">이 페이지의 가드 켜고 끄기 <span aria-hidden="true">↗</span></a></article>
    <article><span class="strength-label">04 · VERIFY</span><h3>기준 해시부터 실제 배포까지<br>결과를 확인하는 검사</h3><p>공개 파일을 신뢰하는 해시와 비교하고, 배포 검사 도구로 최종 바이트·응답 헤더·비공개 경로 노출을 확인합니다.</p><p class="strength-detail">SDK 파일 검사는 직접 호출합니다. 쿠키·리퍼러 없는 요청, 리디렉션 거부와 시간·크기·동시 요청 한도가 적용됩니다.</p><a href="#sdk-file">SDK 파일 검사 체험하기 <span aria-hidden="true">↗</span></a></article>
  </div>
  <div class="sdk-scope-guide" aria-labelledby="scope-guide-heading"><div><span class="strength-label">INTEGRATION SCOPE</span><h3 id="scope-guide-heading">내 앱에는 어떤 방식으로 연결하나요?</h3></div><div class="scope-steps"><article><h4>빌드에 연결</h4><p>Vite는 플러그인으로, Webpack·esbuild·일반 HTML 출력은 범용 후처리로 난독화·자동 SDK·정책 생성을 연결합니다.</p><a href="/docs/#environments">환경별 적용 방법 →</a></article><article><h4>실행 중에 제어</h4><p>같은 SDK 인스턴스의 update()로 설정을 바꿉니다. 입력 제한은 패키지에서 기본 OFF이며 이 사이트는 명시적으로 ON입니다.</p><a href="#live-demo">현재 SDK 설정 보기 →</a></article><article><h4>호스트에서 검증</h4><p>실제 응답 헤더와 비공개 파일 제한을 적용합니다. 인증·인가·가격 재계산은 앱 서버에서 처리해야 합니다.</p><a href="/docs/#policy">서버 정책 적용 방법 →</a></article></div></div>
  <p class="candidate-note">이 페이지의 기능 설명과 체험은 미게시 0.3.0 후보 기준입니다. <a href="/docs/#install">설치 상태와 적용 절차 확인 →</a></p>
</section>`;

export const productFaqMarkup = `<section id="sdk-faq" class="sdk-faq" aria-labelledby="faq-heading"><div class="product-section-heading"><div class="eyebrow">BEFORE YOU INTEGRATE</div><h2 id="faq-heading">적용 전에 궁금할 수 있는 것들.</h2></div>
<details><summary>SDK 스크립트만 넣으면 난독화도 적용되나요?</summary><p>난독화는 빌드 과정에서 JavaScript를 변환합니다. Vite 플러그인 또는 범용 빌드 후처리를 연결하세요. 브라우저 SDK만 초기화하면 입력 제한·알림·명시적 파일 검사만 사용합니다. <a href="/docs/#integration-scope">자동·선택·서버 역할 구분 보기 →</a></p></details>
<details><summary>개발자도구를 완전히 잠그거나 소스를 숨기나요?</summary><p>웹 SDK는 개발자도구 창을 금지·강제 종료하거나 브라우저가 받은 리소스를 숨길 수 없습니다. 난독화는 분석 비용을 높이고, 가드는 페이지 입력과 안내를 제어합니다. 비밀값·권한 판단은 서버에 두세요. <a href="/docs/#limits">보호 범위 확인 →</a></p></details>
<details><summary>난독화 강도와 실제 앱 호환성은 어떻게 확인하나요?</summary><p>Basic·Standard·Strict / High를 선택하고 앱의 폼·동적 모듈·외부 API를 확인하세요. 강한 변환은 크기와 실행 비용을 늘릴 수 있습니다. 이 데모는 한 번의 실제 실행 결과를 비교하며 운영 성능을 보증하는 벤치마크는 아닙니다. SSR·nonce·hydration 통합은 별도 검증이 필요합니다. <a href="#app-examples">보호된 웹앱 예제 보기 →</a></p></details>
</section>`;
