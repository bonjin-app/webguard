import "./style.css";
import { getAutoGuard, installAutoGuard } from "@webguard/browser";
import { siteGuardOptions } from "../../site-guard-options";

// Reuse the build-injected instance. Development starts the same policy here.
const siteGuard = getAutoGuard() ?? installAutoGuard(siteGuardOptions);
const logoUrl = new URL("favicon.svg", document.baseURI).href;
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
<header class="docs-header"><a href="/demo" class="docs-brand" aria-label="WebGuard 데모 홈"><img class="docs-logo" src="${logoUrl}" alt="" width="36" height="36"><span>WebGuard</span><span class="docs-badge">개발자 가이드</span></a><div class="docs-header-links"><a href="#install">SDK 적용하기</a><a class="docs-demo-link" href="/demo">데모 체험</a></div></header>
<div class="layout"><nav class="docs-outline" aria-label="문서 목차"><span>시작하기</span><a href="#overview">가이드 소개</a><a href="#security-strengths">SDK가 더하는 보호</a><a href="#integration-scope">자동 적용과 선택 설정</a><a href="#install">설치와 빌드</a><a href="#environments">환경별 적용</a><a href="#presets">난독화 프리셋</a><span>기능 안내</span><a href="#cli">범용 CLI</a><a href="#automatic">SDK 자동 연결</a><a href="#policy">보안 헤더</a><a href="#browser">브라우저 SDK</a><a href="#integrity-budgets">파일 검사 한도</a><a href="#page-block">페이지 보호 모드</a><a href="#playground">데모 사용법</a><a href="#limits">보호 범위</a><a href="#source">소스와 검증</a></nav><main id="main-content" tabindex="-1">
<aside class="site-protection" aria-label="이 문서의 실제 보호 설정">
  <details id="site-protection-controls">
    <summary><span>이 문서에도 WebGuard 적용 중</span><span class="site-protection-action">실제 설정 바꾸기</span></summary>
    <p>이 페이지의 난독화된 빌드와 SDK를 직접 사용합니다. 아래 변경은 이 문서 전체에 즉시 적용되며 새로고침하면 기본값으로 돌아갑니다.</p>
    <div class="site-protection-switches">
      <label><input id="site-page-block" type="checkbox" checked>검사 입력에 페이지 보호 안내</label>
      <label><input id="site-shortcuts" type="checkbox" checked>검사 단축키 제한 · 입력 영역 포함</label>
      <label><input id="site-context" type="checkbox" checked>우클릭 제한 · 입력 영역 제외</label>
      <label><input id="site-detect" type="checkbox">크기 변화 추정 감지 · 오탐 가능</label>
    </div>
    <p id="site-protection-state" role="status" aria-live="polite"></p>
    <p id="site-protection-event" role="status" aria-live="polite">아직 관측된 SDK 이벤트가 없습니다.</p>
    <p class="site-protection-limit">브라우저 메뉴로 여는 개발자도구와 콘솔 실행은 통제할 수 없습니다. 보호 안내는 페이지 위에 표시되며 개발자도구 창을 닫지 않습니다. 빌드 난독화·서버 보안 헤더는 이 스위치로 해제되지 않습니다.</p>
    <a href="/demo#live-demo">보호 전후 비교와 전체 데모 →</a>
  </details>
</aside>
<section id="overview" class="docs-intro"><div class="eyebrow">WEBGUARD GUIDE</div><h1>내 웹 앱에,<br><span>WebGuard를 연결하세요.</span></h1><p class="lead">빌드할 때 코드를 난독화하고, 배포할 때 정책을 연결하고,<br>실행 중에는 브라우저 가드를 제어하는 SDK입니다.</p><div class="docs-actions"><a class="primary" href="#install">설치부터 시작하기</a><a class="secondary" href="#environments">다른 환경에 적용하기</a></div><p class="docs-meta">Node.js 22.12+ · Vite와 범용 빌드 지원 · 별도 서비스 계정 없이 사용</p><aside>난독화는 코드 분석을 어렵게 합니다. 브라우저에 전달된 파일은 관찰할 수 있으므로 비밀값과 권한 검증은 서버에서 관리하세요.</aside></section>
<section id="security-strengths" aria-labelledby="strengths-heading"><div class="eyebrow">WHAT WEBGUARD ADDS</div><h2 id="strengths-heading">코드·실행·배포를 함께 다룹니다</h2><p>WebGuard의 강점은 난독화 결과만 만드는 데서 끝나지 않고, SDK 초기화와 배포 검사를 같은 빌드 흐름에 연결하는 것입니다. 아래 내용은 공개 데모에 적용된 미게시 0.3.0 후보 기준입니다. npm 게시는 보류 중입니다.</p>
<div class="protection-path">
<article><span class="protection-phase">BUILD</span><div><h3>읽기 쉬운 코드가 그대로 배포되지 않도록</h3><p>Strict / High는 RC4 문자열 인코딩·문자열 분할·제어 흐름 변환을 적용하고 공개 소스맵을 제거합니다. 앱 코드를 분석하는 비용을 높이며, 문자열은 실행 중 복원됩니다.</p><a href="/demo#try-examples">원본과 난독화 결과 비교 →</a></div></article>
<article><span class="protection-phase">BROWSER</span><div><h3>허용할 동작과 반응을 실행 중에 조절</h3><p>페이지에 전달된 취소 가능한 검사 입력·우클릭을 제한하고, 검사 입력에 페이지 보호 안내로 반응합니다. 같은 SDK 인스턴스의 설정을 즉시 바꿀 수 있습니다. 개발자도구 창 자체를 닫거나 콘솔 실행을 통제하지는 못합니다.</p><a href="/demo#live-demo">실제 사이트의 보호 설정 바꾸기 →</a></div></article>
<article><span class="protection-phase">DEPLOY</span><div><h3>만든 보호가 실제 배포에도 남아 있는지 확인</h3><p>SRI 해시와 CSP 정책을 생성하고 배포된 파일·헤더·비공개 경로를 검사합니다. Vite 통합과 범용 빌드 후처리를 제공하므로 Webpack·esbuild·일반 HTML 출력에도 연결할 수 있습니다. 호스트 정책 적용과 서버 권한 검증은 별도로 필요합니다.</p><a href="/demo#resource-exposure">현재 배포 파일과 소스맵 노출 검사 →</a></div></article>
</div><p class="protection-next"><a href="/demo#policy-lab">CSP·DOM 정책의 보호 전후 비교</a><span aria-hidden="true"> · </span><a href="/demo#sdk-file">SDK 파일 검사 체험</a><span aria-hidden="true"> · </span><a href="/docs/INSTALL.ko.txt">한국어 전체 적용 가이드</a></p></section>
<section id="integration-scope" aria-labelledby="scope-heading"><h2 id="scope-heading">무엇이 자동이고, 무엇을 직접 정하나요?</h2><p>빌드 통합을 설치하는 것과 브라우저 SDK만 초기화하는 것은 다릅니다. 사이트에서 켜 둔 입력 제한도 패키지의 기본값과 구분하세요.</p><div class="table-scroll" role="region" aria-label="SDK 자동 적용과 선택 설정 비교" tabindex="0"><table><thead><tr><th scope="col">적용 방식</th><th scope="col">제공되는 동작</th><th scope="col">개발자가 확인할 것</th></tr></thead><tbody>
<tr><th scope="row">빌드 통합 · 자동</th><td>Strict / High 난독화, 공개 소스맵 제거, SDK 시작, SRI·초기 CSP 메타와 정책 파일 생성</td><td><a href="#automatic">Vite 플러그인</a> 또는 <a href="#environments">protect-app 후처리</a>로 빌드하고 앱 호환성 확인</td></tr>
<tr><th scope="row">실행 가드 · 선택</th><td>검사 단축키·우클릭 제한, 페이지 보호 안내, 크기 변화 추정 감지</td><td>입력 제한은 패키지 기본 OFF. 이 사이트는 명시적으로 ON. 크기 추정은 오탐 가능</td></tr>
<tr><th scope="row">파일 검사 · 직접 호출</th><td>신뢰하는 기준 해시와 공개 파일 비교. 쿠키·리퍼러 없이 요청하고 리디렉션 거부</td><td><a href="#integrity-budgets">검사 활성화 후 checkIntegrity 호출</a>. 기본 10초·압축 해제 후 16MiB·동시 4개. 자동 전체 파일 감시 아님</td></tr>
<tr><th scope="row">호스트·서버 · 별도</th><td>보호 서버·Vite preview는 헤더와 비공개 경로 제한 적용</td><td>정적 호스트·CDN은 <a href="#policy">실제 헤더와 경로 거부 규칙</a> 적용. 인증·가격·권한은 앱 서버에서 검증</td></tr>
</tbody></table></div><p>브라우저가 실행하려고 받은 JavaScript·HTML·CSS와 요청은 관찰할 수 있습니다. 비밀값을 숨기거나 사용자 브라우저를 신뢰하는 방식의 인증을 제공하지 않습니다. <a href="#limits">전체 보호 범위 확인 →</a></p></section>
<section id="install"><h2>설치하고, 내 앱에 적용하세요</h2><aside>0.3.0은 아직 npm에 게시하지 않았습니다. 현재 공개 버전은 0.2.0입니다. 아래 새 동작은 로컬 후보 기준이며 공개 0.2.0에 동일하게 제공된다고 판단하지 마세요.</aside><p>Node.js 22.12 이상에서 사용합니다. 패키지 하나에 범용 CLI·빌드 API·독립 SDK·Vite 연동·보호 서버가 포함됩니다. Vite가 없어도 범용 빌드 경로를 사용할 수 있습니다. 아래는 Vite 7/8의 ESM 웹 앱 설정입니다.</p><p>검토한 로컬 tgz가 있다면 아래 경로를 실제 파일 경로로 바꿔 시험 앱에 설치합니다.</p><pre><code>npm install -D /absolute/path/to/uulab-webguard-0.3.0.tgz</code></pre><details class="future-install"><summary>npm 게시 후 사용할 설치 명령</summary><pre><code># 0.3.0 배포 후에만 실행 — 현재는 미게시
npm install -D uulab-webguard@0.3.0</code></pre></details><pre><code>import { defineConfig } from 'vite';
import { webguardApp } from 'uulab-webguard';
export default defineConfig({ plugins: [webguardApp()] });</code></pre><p>Strict/High·RC4 문자열 인코딩, 자동 SDK 시작, SRI·공개 소스맵 제거와 초기 HTML CSP 메타가 기본 적용됩니다. 호스트 헤더가 없어도 메타를 지원하는 정책은 동작합니다. 네트워크는 기본 connect-src 'self'이고 Trusted Types는 지원 브라우저에서 강제합니다. 미지원 환경을 보호된 것으로 판단하지 마세요. 개발/HMR은 그대로 유지합니다.</p><pre><code>npm run build &amp;&amp; npx webguard-serve dist --port 4173</code></pre><p>루프백 보호 서버는 실제 응답 헤더와 비공개 파일 제한을 적용합니다. Vite preview도 같은 플러그인이 별도 설정 없이 처리합니다. 정적 호스트·CDN은 생성 _headers 지원 여부와 비공개 경로 거부 규칙을 모두 설정해야 합니다. frame-ancestors·Trusted Types report-only·MIME 보호는 실제 HTTP 헤더가 필요합니다.</p><h3>초기 렌더링 호환성을 먼저 확인하세요</h3><p>공식 vanilla 템플릿은 innerHTML을 사용하므로 기본 Trusted Types 강제 정책에서 화면이 뜨지 않을 수 있습니다. 앱 소스의 문자열 HTML 삽입 지점을 발견하면 빌드가 WG_TRUSTED_TYPES_SINK 경고와 상대 파일 위치를 표시합니다. 경고는 구문 검사이며 실행 경로·별칭·동적 키·의존성을 전부 검사하지 못합니다. 안전한 DOM API로 바꾸거나 headers.trustedTypes: 'report-only'를 명시적으로 선택한 후 브라우저에서 확인하세요. 관찰 모드는 해당 sink를 차단하지 않고 실제 HTTP 헤더가 필요합니다. 정책을 자동으로 약하게 바꾸지는 않습니다.</p><p><a href="/demo#setup">프로젝트별 Vite 설정 생성기 열기</a> — React·DOM API 앱·vanilla 원본 템플릿과 단축키·우클릭 옵션에 맞는 설정을 복사합니다. 생성기 선택은 현재 페이지의 보호 정책을 바꾸지 않습니다.</p><h3>실제 배포 결과 검사</h3><pre><code>npx --no-install webguard-check dist --url http://127.0.0.1:4173/
npx --no-install webguard-check dist --url https://YOUR-SITE.example/</code></pre><p>실제 배포에 사용한 로컬 dist로 바이트·SHA-384·응답 헤더·소스맵과 서버 제어 파일 노출을 검사합니다. 메타 정책이 있어도 필수 HTTP 정책 누락을 대신하지 못합니다. 실패하면 JSON 오류와 종료 코드 1을 반환합니다. 원격 매니페스트를 신뢰 기준으로 바꾸지 않습니다.</p><p><a href="/docs/INSTALL.ko.txt">한국어 전체 가이드 열기</a> — 외부 API 허용, Trusted Types 호환성, 보호 서버와 정적 호스트 설정을 포함합니다. 설치 패키지에도 INSTALL.ko.md가 포함됩니다.</p><p>RC4 문자열은 런타임에 복원됩니다. 전달된 HTML·CSS·JavaScript와 네트워크 요청은 관찰할 수 있으며, 개발자도구 창을 잠그지 않습니다. 비밀값·가격 재계산·권한 검증은 서버 책임입니다.</p></section>
<section id="environments"><h2>Vite 외 환경에도 연결하세요</h2><p>Webpack·esbuild·일반 HTML/jQuery는 기존 빌드 후 같은 보호 명령을 사용합니다. Vite는 선택적 의존성이며 범용 빌드 API를 가져올 때 필요하지 않습니다. SDK 초기화·난독화·SRI·헤더 파일을 함께 생성합니다.</p><pre><code>npm run build:raw
npx --no-install webguard protect-app dist --output dist-protected --trusted-types report-only
npx --no-install webguard-serve dist-protected --port 4173</code></pre><pre><code>import { protectAppDirectory } from 'uulab-webguard/build';
await protectAppDirectory('dist', {
  output: 'dist-protected',
  runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
  headers: { trustedTypes: 'report-only' },
});</code></pre><p>Strict 난독화가 기본이고 입력 제한은 명시적으로 켭니다. report-only는 Trusted Types 호환성 관찰 설정이며 인라인 스크립트를 허용하거나 HTML을 정화하지 않습니다. 기존 출력은 덮어쓰지 않습니다. 인라인 코드·이벤트·스타일은 외부화하거나 관리할 정책을 명시하세요.</p><p>HTML·JSP·PHP·ASP.NET 템플릿에서는 패키지의 <code>uulab-webguard/browser.global.js</code>를 외부 스크립트로 복사하고 별도 파일에서 <code>WebGuardSDK.WebGuard.init()</code>을 호출할 수 있습니다. SDK만 연결하면 난독화는 생기지 않습니다. 서버 템플릿 자체는 JavaScript 난독화 대상이 아닙니다.</p><p>서버 예제는 실행 미검증 레시피입니다. Next.js·Nuxt·Angular 등의 SSR·nonce·hydration·서명/프리캐시 자동 통합은 검증된 지원으로 주장하지 않습니다. 후처리 전 파일명의 contenthash는 최종 변환 바이트를 증명하지 않으므로 배포별 경로 또는 재검증 캐시 정책을 쓰세요.</p><p><a href="/docs/ENVIRONMENTS.ko.txt">한국어 환경별 가이드</a> · 저장소 예제: <code>examples/webpack</code>, <code>examples/esbuild</code>, <code>examples/plain-html</code></p></section>
<section id="presets"><h2>앱에 맞는 난독화 강도를 선택하세요</h2><div class="cards"><article><h3>Basic</h3><p>변환 비용을 낮춘 가벼운 설정입니다. 실행 성능에 민감한 앱에서 먼저 비교해 보세요.</p></article><article><h3>Standard</h3><p>문자열 변환과 실행 비용의 균형을 고려한 설정입니다. 실제 앱에서 크기와 실행 시간을 확인하세요.</p></article><article><h3>Strict / High <small>자동 통합 기본값</small></h3><p>RC4 문자열 인코딩, 제어 흐름 변환, 문자열 분할과 함수 래퍼로 분석 비용을 높입니다. 파일 크기와 실행 비용도 커집니다. 인코딩된 문자열은 실행 중 복원됩니다.</p></article></div><p>프리셋은 변환 정책이며 보안 등급을 뜻하지 않습니다. 단축키와 우클릭 제한은 모든 프리셋에서 기본 꺼짐이며 직접 켜야 합니다.</p></section>
<section id="cli"><h2>기존 빌드에 보호 단계를 연결하세요</h2><p>검토한 로컬 후보 패키지를 설치한 뒤 기존 빌드 결과를 처리합니다. <code>--help</code>로 옵션을 확인하고, 새로운 출력 경로를 선택하세요.</p><pre><code>npx --no-install webguard --help
npx --no-install webguard protect-app dist --output dist-protected
npx --no-install webguard scan dist-protected
npx --no-install webguard verify dist-protected
npx --no-install webguard report dist-protected</code></pre><ol><li>사용하는 빌드 도구로 앱 소스를 JavaScript로 빌드합니다.</li><li>호환성을 확인할 코드와 정책을 검토하고 원본 빌드 결과를 보관합니다.</li><li>별도 보호 디렉터리를 생성합니다. 비공개 소스맵은 공개 경로 밖에 보관합니다.</li><li>최종 매니페스트를 검증하고 보호된 앱을 브라우저에서 실행합니다.</li></ol><p>변환에 실패하면 빌드도 실패해야 합니다. 파일 해시는 신뢰하는 기준값과의 차이를 확인합니다. 매니페스트까지 바꿀 수 있는 환경에서는 해시만으로 진위를 보장할 수 없습니다.</p></section>
<section id="automatic"><h2>설정 한 번으로 SDK를 자동 연결하세요</h2><pre><code>import { webguardApp } from 'uulab-webguard';
export default { plugins: [webguardApp({
  runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
})] };</code></pre><p>Vite 통합은 Strict/High를 기본으로 앱 진입점보다 먼저 SDK를 시작하고 초기 CSP 메타와 HTTP 정책 파일을 생성합니다. Vite preview에는 헤더와 비공개 파일 제한도 적용됩니다. 앱에서 SDK를 따로 초기화하지 않아도 됩니다. 개발 모드의 동작은 유지하며 단축키·우클릭 제한은 명시적으로 켜야 합니다.</p><pre><code>import { getWebGuard } from 'uulab-webguard/client';
getWebGuard()?.update({ devtools: { blockShortcuts: false } });</code></pre><p>설치한 앱에서 설정을 바꾸면 재빌드나 새로고침 없이 즉시 반영됩니다. 새로고침하면 빌드 설정으로 돌아갑니다. <a href="/examples/react/">실시간 제어가 있는 React 예제</a>는 이 데모에서 바로 열 수 있습니다. <code>webguard-serve</code>는 생성한 헤더와 비공개 파일 제한을 적용합니다. 배포 패키지 이름은 <code>uulab-webguard</code>이며 <code>@webguard/*</code>는 내부 작업 공간 이름입니다. 이 안내는 미게시 0.3.0 후보 기준이고 npm 공개 버전은 0.2.0입니다.</p></section>
<section id="policy"><h2>네트워크·DOM 정책과 실제 HTTP 헤더</h2><div class="table-scroll" role="region" aria-label="보호 계층 비교" tabindex="0"><table><thead><tr><th>계층</th><th>후보의 적용 범위</th><th>제한·별도 책임</th></tr></thead><tbody><tr><td>자동 HTML</td><td>초기 CSP 메타 · 스크립트·네트워크·지원되는 Trusted Types 강제</td><td>HTTP 전용 정책·비공개 파일 숨김 불가</td></tr><tr><td>HTTP 서버</td><td>보호 서버·preview의 응답 헤더와 비공개 경로 제한</td><td>정적 호스트는 자체 규칙 적용</td></tr><tr><td>SDK</td><td>자동 시작 · 선택적 입력 제한 · 추정 신호</td><td>F12·우클릭 제한 기본 꺼짐 · 개발자도구 잠금 불가</td></tr><tr><td>앱 서버</td><td>개발자가 가격·입력·권한 검증 구현</td><td>SDK의 자동 기능 아님</td></tr></tbody></table></div><p>Trusted Types 미지원은 검증 성공으로 세지 않습니다. SDK의 명시적 파일 검사와 브라우저의 SRI·CSP는 서로 다른 기능입니다.</p><pre><code>webguardApp({
  headers: {
    allowedOrigins: { connect: ['https://api.example.com'] },
    trustedTypes: 'report-only',
  },
});</code></pre><p>외부 API는 정확한 HTTP(S) 출처만 허용하세요. Trusted Types는 기본 enforce이며 report-only 또는 off로 바꿀 수 있습니다. report-only는 실제 HTTP 헤더가 적용되어야 관측합니다. 메타는 report-only·frame-ancestors를 지원하지 않습니다. HTML 정화나 서버 권한 검증을 대신하지 않으며 원격 보고 서비스도 자동 설정하지 않습니다.</p><p>headers: false는 자동 메타·헤더 생성과 preview 정책 처리를 끕니다. 기존 호스트 정책과 비공개 경로 처리를 직접 적용·검증하세요. 정적 호스팅에서는 webguard-report.json, webguard-headers.json, _headers, 소스맵·환경·설정 파일을 공개하지 마세요. 응답 헤더 설정만으로 파일이 숨겨지지는 않습니다.</p><pre><code>// Node 전용 — 브라우저 앱 코드에 가져오지 마세요.
import { createProtectedServer } from 'uulab-webguard/server';
const server = await createProtectedServer('dist');
server.listen(4173, '127.0.0.1');</code></pre><p>서버 정책 문자열만 생성하려면 createSecurityHeaders를 uulab-webguard/headers에서 가져옵니다. 생성된 HTTP 정책은 실제 서버·CDN 응답에 적용해야 합니다. 브라우저가 전달받은 코드를 관찰하거나 콘솔을 사용하는 동작은 통제하지 못합니다.</p></section>
<section id="browser"><h2>브라우저 가드를 직접 제어하세요</h2><pre><code>import { WebGuard } from 'uulab-webguard/browser';

const guard = WebGuard.init({
  devtools: {
    detect: true,
    blockShortcuts: false,
    blockContextMenu: false,
    response: 'monitor',
  },
  onThreat(event) {
    console.info('Local advisory:', event.type);
  },
});

// On application teardown:
guard.destroy();</code></pre><p>탐지는 오탐과 누락이 있는 참고 신호입니다. 인증이나 권한 판단에 사용하지 마세요. 단축키 제한은 페이지에 전달된 입력에만 적용되고 개발자도구 창 전체를 잠그지 못합니다. 이벤트는 로컬 콜백으로 전달하며 원격 수집을 자동으로 시작하지 않습니다.</p></section>
<section id="integrity-budgets"><h2>파일 검사 요청에도 한도를 적용해요</h2><p>미게시 후보의 checkIntegrity는 검사를 활성화하고 직접 호출할 때 실행됩니다. 파일 전체를 자동 감시하지 않습니다. 쿠키·리퍼러를 보내지 않고 리디렉션을 거부합니다. 기본 10초·압축 해제 후 16MiB·인스턴스당 동시 4개로 제한합니다. 시간 초과나 크기 초과를 변조 탐지 성공으로 계산하지 않습니다.</p><pre><code>webguardApp({ runtime: { integrity: {
  enabled: true,
  timeoutMs: 10_000,
  maxBytes: 16 * 1024 * 1024,
  maxConcurrent: 4,
} } });</code></pre><p>쿠키·HTTP 인증이 필요한 자원은 이 검사 대상이 아닙니다. 공개 배포 파일과 신뢰할 수 있는 기준 해시를 사용하세요. <a href="/docs/INSTALL.ko.txt">한도·취소·호환성 전체 안내</a></p></section>
<section id="page-block"><h2>페이지 보호 모드를 선택할 수 있어요</h2><pre><code>// 미게시 후보: Vite의 runtime 또는 직접 초기화하는 SDK에 적용
webguardApp({
  runtime: { devtools: {
    detect: true,
    blockShortcuts: true,
    shortcutScope: 'page',
    response: 'block',
  } },
});</code></pre><p>입력 영역에서도 검사 단축키를 취소하고, 관측된 검사 입력·도킹 크기 추정 신호에 네이티브 모달로 반응합니다. 모드 진입 시 크기를 검사하며 닫은 뒤 다시 확인할 수 있습니다. 일반 입력·복사·붙여넣기와 IME 조합은 유지합니다. 기존 기본 설정은 바뀌지 않습니다.</p><p>개발자도구 창을 닫지 않으며 DOM·콘솔·백그라운드 작업은 통제하지 못합니다. 크기 감지는 오탐·미탐이 있고 모달 미지원·표시 실패는 별도 이벤트로 구분합니다. 서버 권한 검증의 경계가 아닙니다. <a href="/demo#live-demo">페이지 보호 모드 체험</a> · <a href="/docs/INSTALL.ko.txt">옵션과 이벤트 전체 안내</a>. npm 게시는 계속 보류 중입니다.</p></section>
<section id="playground"><h2>데모에서 보호 전후를 비교하세요</h2><p><a href="/demo">공개 데모</a>에서는 전용 Worker가 브라우저 안에서 코드를 변환합니다. 원본과 보호 결과의 UTF-8 크기, 변환 시간과 한 번의 실행 결과를 비교할 수 있습니다. 입력 코드를 서버에 업로드하지 않습니다.</p><p>입력 코드는 불투명 출처의 sandbox iframe 안에 있는 일회용 Worker에서 실행합니다. 앱 출처와 DOM에 접근하지 못하고 CSP로 네트워크 요청을 제한합니다. 모듈 로드·팝업·폼·다운로드도 제공하지 않습니다. 각 실행은 1초로 제한하며 입력 크기와 콘솔 출력에도 한도가 있습니다.</p><p><code>console.log</code>로 재현 가능한 결과를 비교하세요. 수집한 출력이 같아도 모든 실행 동작이 동일하다는 증거는 아닙니다. 동기 스크립트 완료 후의 백그라운드 비동기 작업은 비교하지 않습니다. 실행 시간은 Worker 처리 비용을 포함하는 단일 측정이며 벤치마크 점수가 아닙니다.</p></section>
<section id="limits"><h2>보호 범위와 한계를 확인하세요</h2><p>고정된 데모 삽입 시험은 CSP 위반·Trusted Types TypeError, 가격 변조 시험은 HTTP 409를 의도적으로 발생시킵니다. 빨간 로그만으로 성공을 판단하지 말고 보호 전 정상 실행·응답과 보호 후의 정책 위반·해시 불일치를 함께 확인하세요. 일반 앱의 404·5xx·처리되지 않은 예외·기준 응답 실패는 예상 차단으로 분류하지 않습니다. 미지원·확인 불가는 성공에서 제외하고 로그를 숨기지 않습니다.</p><ul><li>난독화는 분석 비용을 높이지만 코드를 받는 브라우저로부터 암호화해 숨기지는 않습니다.</li><li>클라이언트의 무결성 검사도 사용자가 변경하거나 우회할 수 있습니다.</li><li>동적 import, DOM 동작, 실행 시간과 외부 라이브러리는 실제 앱에서 회귀 검증해야 합니다.</li><li>Worker 격리는 우발적인 간섭을 줄이지만 적대적 코드의 완전한 격리를 보장하지 않습니다. 자원 고갈과 브라우저 취약점도 보호 범위 밖입니다.</li><li>무한 debugger, 강제 새로고침, 브라우저 프리징과 자동 원격 분석은 사용하지 않습니다.</li></ul></section>
<section id="source"><h2>소스와 검증 기록을 확인하세요</h2><p>소스 작업 공간의 <code>packages/</code>에는 SDK와 도구가, <code>examples/</code>에는 연동 예제가, <code>tests/</code>에는 단위·브라우저 검사가 있습니다.</p><pre><code>pnpm verify
pnpm test:e2e
pnpm benchmark</code></pre><p>위 명령은 검증을 실행하는 방법이며 모든 플랫폼의 통과를 뜻하지 않습니다. 브라우저 자동화 결과와 실제 기기 검증도 구분합니다. 저장소의 <code>README.md</code>, <code>THREAT_MODEL.md</code>, <code>SECURITY.md</code>에서 자세한 범위를 확인하세요.</p><p>WebGuard는 MIT 라이선스이며 변환 엔진 javascript-obfuscator 5.9.0은 BSD-2-Clause 라이선스입니다. 배포할 때 필요한 라이선스 고지를 유지하세요.</p><a href="https://github.com/javascript-obfuscator/javascript-obfuscator" rel="noreferrer">변환 엔진 소스 보기</a></section>
<footer>WebGuard · 내 웹 앱에 연결하는 보호 SDK</footer></main></div>`;

const outlineLinks =
  document.querySelectorAll<HTMLAnchorElement>(".docs-outline a");
function syncCurrentSection() {
  const current = window.location.hash || "#overview";
  for (const link of outlineLinks) {
    if (link.getAttribute("href") === current)
      link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}
window.addEventListener("hashchange", syncCurrentSection);
syncCurrentSection();

const siteSwitch = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!;
const pageBlockSwitch = siteSwitch("site-page-block");
const shortcutSwitch = siteSwitch("site-shortcuts");
const contextSwitch = siteSwitch("site-context");
const detectSwitch = siteSwitch("site-detect");
const siteStatus = document.querySelector<HTMLElement>(
  "#site-protection-state",
)!;
const eventStatus = document.querySelector<HTMLElement>(
  "#site-protection-event",
)!;

function renderSiteProtection() {
  const options = siteGuard.getOptions().devtools;
  pageBlockSwitch.checked = options?.response === "block";
  shortcutSwitch.checked = options?.blockShortcuts === true;
  contextSwitch.checked = options?.blockContextMenu === true;
  detectSwitch.checked = options?.detect === true;
  siteStatus.textContent = `실제 SDK 상태 · 페이지 보호 안내 ${pageBlockSwitch.checked ? "ON" : "OFF"} · 단축키 ${shortcutSwitch.checked ? "ON" : "OFF"} · 우클릭 ${contextSwitch.checked ? "ON" : "OFF"} · 크기 추정 ${detectSwitch.checked ? "ON" : "OFF"}`;
}

function updateSiteProtection() {
  siteGuard.update({
    devtools: {
      detect: detectSwitch.checked,
      blockShortcuts: shortcutSwitch.checked,
      blockContextMenu: contextSwitch.checked,
      response: pageBlockSwitch.checked ? "block" : "monitor",
      shortcutScope: "page",
    },
  });
  renderSiteProtection();
}

siteGuard.update({
  onThreat(event) {
    const messages: Record<string, string> = {
      "shortcut-blocked": "페이지에 전달된 검사 단축키를 취소했습니다.",
      "shortcut-unavailable": "이 입력은 취소할 수 없습니다.",
      "context-menu-blocked": "페이지의 우클릭 기본 동작을 취소했습니다.",
      "context-menu-unavailable": "이 우클릭 이벤트는 취소할 수 없습니다.",
      "devtools-heuristic":
        "크기 변화 추정 신호입니다. 개발자도구 열림을 확정하지 않습니다.",
      "page-blocked":
        "페이지 보호 안내가 표시되었습니다. 개발자도구 창의 상태는 바꾸지 않습니다.",
      "page-unblocked": "페이지 보호 안내가 해제되었습니다.",
      "page-block-unavailable":
        "이 브라우저에서 페이지 보호 안내를 표시할 수 없습니다.",
    };
    eventStatus.textContent =
      messages[event.type] ?? `SDK 이벤트: ${event.type}`;
    if (event.type !== "page-blocked") return;
    const dialog = document.querySelector("[data-webguard-blocker]");
    if (!dialog || dialog.querySelector("[data-site-block-exit]")) return;
    const exit = document.createElement("button");
    exit.type = "button";
    exit.setAttribute("data-site-block-exit", "");
    exit.className = "site-protection-exit";
    exit.textContent = "이 사이트의 보호 모드 끄기";
    exit.addEventListener("click", () => {
      pageBlockSwitch.checked = false;
      updateSiteProtection();
    });
    (dialog.querySelector("section") ?? dialog).append(exit);
  },
});
for (const control of [
  pageBlockSwitch,
  shortcutSwitch,
  contextSwitch,
  detectSwitch,
])
  control.addEventListener("change", updateSiteProtection);
renderSiteProtection();
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) siteGuard.destroy();
});
