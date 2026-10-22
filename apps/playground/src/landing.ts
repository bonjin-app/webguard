const cubeArt = new URL("./assets/sdk-cube.webp", import.meta.url).href;

/** Product presentation links to the same live SDK and source-grounded documentation. */
export const landingHeroMarkup = `
<section class="sdk-hero landing-hero" aria-labelledby="hero-heading">
  <div class="hero-content">
    <div class="hero-copy">
      <div class="eyebrow">WEB APPLICATION PROTECTION SDK</div>
      <h1 id="hero-heading">웹앱 보호의 시작,<br><span>스크립트부터 빌드까지.</span></h1>
      <p class="hero-description">브라우저 가드는 SDK로, 앱 코드 난독화는 빌드로.<br>내 환경에 맞게 연결하는 WebGuard.</p>
      <div class="hero-actions"><a class="primary" href="#sdk-install">SDK 적용하기 <span aria-hidden="true">→</span></a><a class="demo-link" href="#sdk-demo">데모 체험하기 <span aria-hidden="true">↗</span></a></div>
      <p class="hero-note">HTML · JSP부터 Vite · Next.js까지</p>
      <a class="hero-api-link" href="/docs/API.ko.html">함수·옵션 API 명세 살펴보기 <span aria-hidden="true">→</span></a>
    </div>
    <div class="hero-visual" aria-label="앱 코드 난독화를 위한 Vite 빌드 연결 예시">
      <div class="sdk-package-art"><img src="${cubeArt}" alt="WebGuard SDK 패키지" width="180" height="180" fetchpriority="high"><div><span class="visual-kicker">CONNECT. BUILD. PROTECT.</span><strong>WebGuard SDK</strong><p>보호는 더하고, 개발 흐름은 그대로.</p></div></div>
      <div class="hero-code"><div class="code-filename"><span>vite.config.ts</span><span>빌드 연결 예시</span></div><pre><code><span class="syntax-keyword">import</span> { defineConfig } <span class="syntax-keyword">from</span> 'vite';
<span class="syntax-keyword">import</span> { webguardApp } <span class="syntax-keyword">from</span> 'uulab-webguard';

<span class="syntax-keyword">export default</span> defineConfig({
  plugins: [<span class="syntax-call">webguardApp</span>()],
});</code></pre></div>
      <ul class="hero-capabilities" aria-label="기본 빌드 연결 기능"><li>Strict / High 난독화</li><li>SDK 자동 시작</li><li>SRI · 소스맵 제거</li></ul>
    </div>
  </div>
</section>
<section class="environment-ribbon" aria-label="지원 환경 안내"><p>프레임워크가 달라도,<br class="mobile-break"> 내 프로젝트의 흐름에 맞게.</p><ul><li>Vite</li><li>React · Next.js</li><li>Webpack · esbuild</li><li>HTML · 서버 템플릿</li></ul><a href="/docs/ENVIRONMENTS.ko.html">환경별 지원 범위 <span aria-hidden="true">↗</span></a></section>
<section class="connection-paths" aria-labelledby="connection-heading">
  <div class="connection-heading"><div class="eyebrow">CHOOSE YOUR PATH</div><h2 id="connection-heading">필요한 보호부터 연결하세요.</h2></div>
  <div class="connection-options">
    <article><span class="connection-label">파일 · CDN 연결</span><h3>브라우저 가드부터 시작하기</h3><p>SDK와 초기화 파일을 기존 페이지에 연결하세요.<br>Node·npm 없이 HTML·JSP에서도 시작할 수 있습니다.</p><p class="connection-scope">SDK 연결만으로 앱 코드가 난독화되지는 않습니다.</p><div class="connection-links"><a href="/docs/START_CDN.ko.html">파일 · CDN 적용 가이드 <span aria-hidden="true">→</span></a><a href="/docs/START_JAVA.ko.html">Java · JSP 안내 <span aria-hidden="true">↗</span></a></div></article>
    <article><span class="connection-label">빌드 연결</span><h3>앱 JavaScript도 난독화하기</h3><p>Vite·Next.js에 연결하거나 기존 빌드 뒤에 추가하세요.<br>배포할 앱 코드를 변환하고 SDK를 함께 연결합니다.</p><p class="connection-scope">서버 코드와 템플릿은 유지하고, 브라우저 JS를 보호합니다.</p><div class="connection-links"><a href="/docs/#install">내 환경의 빌드 가이드 <span aria-hidden="true">→</span></a><a href="/docs/START_HTML.ko.html">HTML · jQuery 안내 <span aria-hidden="true">↗</span></a></div></article>
  </div>
</section>`;

export const landingResourcesMarkup = `
<section id="developer-resources" class="developer-resources" aria-labelledby="resources-heading">
  <div class="product-section-heading"><div class="eyebrow">FOR DEVELOPERS</div><h2 id="resources-heading">처음 연결할 때도,<br>깊이 살펴볼 때도.</h2><p>첫 연결부터 설정 확인, 운영 정책까지.<br>필요한 가이드를 바로 찾아보세요.</p></div>
  <div class="resource-links"><a href="/docs/INSTALL.ko.html"><span class="resource-symbol" aria-hidden="true">01</span><div><h3>설치와 첫 빌드</h3><p>내 환경의 설치 방법과 적용 확인 순서를 따라가세요.</p></div><span aria-hidden="true">↗</span></a><a href="/docs/ENVIRONMENTS.ko.html"><span class="resource-symbol" aria-hidden="true">02</span><div><h3>내 환경에 적용</h3><p>Vite·Next·정적 HTML·SSR의 연결 방법과 지원 범위.</p></div><span aria-hidden="true">↗</span></a><a href="/docs/API.ko.html"><span class="resource-symbol" aria-hidden="true">03</span><div><h3>함수와 옵션 명세</h3><p>입력·기본값·반환값·이벤트·오류와 코드 예제.</p></div><span aria-hidden="true">↗</span></a><a href="/docs/OPERATIONS.ko.html"><span class="resource-symbol" aria-hidden="true">04</span><div><h3>개발부터 운영까지</h3><p>개발·스테이징·운영 정책, 적용 상태 진단과 문제 해결.</p></div><span aria-hidden="true">↗</span></a></div>
</section>`;

export const landingFooterMarkup = `<footer class="site-footer product-footer"><div class="footer-top"><div class="footer-brand"><a class="brand" href="/" aria-label="WebGuard 홈"><span class="logo">W</span>WebGuard</a><p>내 웹앱을 위한 코드 보호 SDK.</p></div><nav aria-label="제품 바로가기"><strong>제품</strong><a href="/demo">실시간 데모</a><a href="#sdk-downloads">다운로드 · CDN</a><a href="#sdk-install">SDK 적용</a></nav><nav aria-label="개발자 문서"><strong>개발자</strong><a href="/docs/INSTALL.ko.html">설치 가이드</a><a href="/docs/ENVIRONMENTS.ko.html">환경별 적용</a><a href="/docs/API.ko.html">API 명세</a><a href="/docs/OPERATIONS.ko.html">운영 가이드</a></nav><nav aria-label="프로젝트 정보"><strong>프로젝트</strong><a href="https://github.com/bonjin-app/webguard">GitHub ↗</a><a href="/third-party-licenses.md">라이선스</a><a href="#sdk-faq">자주 묻는 질문</a></nav></div><div class="footer-bottom"><p>난독화는 분석을 어렵게 합니다. 권한 검증은 서버에서 처리하세요.</p><details><summary>보호 범위와 실행 제한</summary><p>브라우저에 전달된 JavaScript는 확인하거나 수정할 수 있습니다. 비밀 정보와 권한 검증은 서버에서 처리하세요. 데모 실행 도구는 DOM 접근 없이 콘솔 기반 JavaScript를 지원하며 모듈 가져오기와 네트워크 요청을 차단합니다. 실행 워커는 1초 후 중단됩니다. 코드를 시험하는 보조 도구이며 악성 코드를 안전하게 격리하는 서비스는 아닙니다.</p></details></div></footer>`;
