# WebGuard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

**웹 애플리케이션을 위한 JavaScript 난독화, 브라우저 런타임 가드, 배포 검증 도구입니다.**

빌드에 WebGuard를 연결하고, 보호 처리한 브라우저 에셋을 배포한 뒤, 직접 애플리케이션에서 결과를 확인하세요. 웹사이트에서는 SDK의 실제 동작을 체험할 수 있습니다.

[웹사이트](https://webguard.uulab.co.kr/) · [인터랙티브 데모](https://webguard.uulab.co.kr/demo) · [API 레퍼런스 (한국어)](docs/API.ko.md) · [기여 안내](CONTRIBUTING.md) · [MIT 라이선스](LICENSE)

## 주요 기능

- 컴파일된 브라우저 JavaScript를 설정 가능한 프리셋으로 난독화합니다. Strict/High 문자열 및 제어 흐름 변환을 포함합니다.
- 공개 소스맵을 제거하고 최종 바이트 기준 SHA-384 매니페스트를 생성합니다. 정적 HTML 통합에서는 SRI 참조도 생성합니다.
- 선택적 브라우저 가드를 자동으로 시작합니다. 실행 중 정책 변경, 페이지에서 처리하는 단축키·컨텍스트 메뉴 제한, DOM 변경 신호, 실행 지연 신호를 지원합니다.
- 정적 배포 정책을 생성하고, 배포된 바이트·응답 헤더·알려진 비공개 파일 경로를 신뢰할 수 있는 로컬 빌드와 비교합니다.

**브라우저로 전달되는 코드, HTML, 네트워크 트래픽은 계속 관찰할 수 있습니다. 난독화는 분석 비용을 높이는 기법이며 암호화가 아닙니다. 웹 SDK는 브라우저 자체의 DevTools를 신뢰성 있게 감지하거나 비활성화하거나 닫을 수 없습니다. 자격 증명, 권한 검사, 결제 판단은 서버에서 처리하세요.**

## 설치 경로 선택

빌드 도구에는 **Node.js 22.12 이상**이 필요합니다. 제품명은 **WebGuard**이며, npm 식별자는 `uulab-webguard`입니다. 내부 `@webguard/*` 워크스페이스 패키지는 공개 설치 대상이 아닙니다.

**2026-10-22 확인 기준 릴리스 상태:** npm `latest`는 **0.2.0**입니다. 아래 통합 안내는 **아직 배포하지 않은 0.3.0 후보 버전**을 설명합니다. npm 배포는 계속 보류 중이므로 `npm install uulab-webguard@latest`로 후보 버전 API를 사용할 수 있다고 가정하지 마세요.

[SDK/패키지 다운로드](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 후보 버전을 내려받고, [다운로드 카탈로그](https://webguard.uulab.co.kr/downloads/catalog.json)의 다이제스트와 대조하세요. 아래 명령 전에 내려받은 `.tgz`를 적용할 앱의 프로젝트 루트로 옮기거나, 명령의 경로를 실제 파일의 절대 경로로 바꾸세요.

```sh
npm install -D ./uulab-webguard-0.3.0.tgz
```

프로덕션 적용 전에 별도 애플리케이션에서 후보 버전을 검토하세요. 의존성 설치에는 여전히 네트워크가 필요합니다. CDN SDK는 런타임 가드만 제공하며 애플리케이션을 난독화하지 않습니다.

| 환경                   | 통합 방식                                            | 예제 / 범위                                                                                                                                   |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite 7/8, React + Vite | 기존 설정에 `webguardApp()` 추가                     | [React](examples/react-vite/README.md), [TypeScript](examples/vanilla-ts/README.md), [JavaScript](examples/vanilla-js/README.md); 브라우저 앱 |
| Next.js App Router     | `withWebGuard()` + Webpack 프로덕션 빌드             | [Next SSR](examples/next-ssr/README.md); 클라이언트 청크만 대상                                                                               |
| Webpack                | `protect-app`으로 정적 출력 후처리                   | [Webpack](examples/webpack/README.md); 네이티브 Webpack 플러그인 없음                                                                         |
| esbuild                | 동일한 정적 출력 후처리                              | [esbuild](examples/esbuild/README.md)                                                                                                         |
| 일반 HTML / JavaScript | 정적 출력 보호 또는 런타임 SDK 수동 로드             | [일반 HTML](examples/plain-html/README.md)                                                                                                    |
| Java / JSP / Servlet   | 보호 처리한 브라우저 에셋 + SRI + 서버 헤더          | [Java 17 / Servlet 6 / Tomcat 10.1](examples/jsp-servlet/README.md)                                                                           |
| Python / PHP           | 보호 처리한 브라우저 에셋 + 서버 렌더링 태그 및 헤더 | [WSGI / PHP](examples/ssr-templates/README.md)                                                                                                |
| ASP.NET / Nginx        | 보호 처리한 에셋 + 호스트별 정책                     | [서버 레시피](examples/server-templates/README.md); 레시피 제공 범위이며 실제 서버 실행 검증은 아님                                           |

### Vite 및 React + Vite

`react()` 같은 기존 프레임워크 플러그인을 유지하고 WebGuard를 한 번 추가하세요.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";

export default defineConfig({
  plugins: [
    // Keep your existing plugins here.
    webguardApp({
      runtime: {
        devtools: { blockShortcuts: true, blockContextMenu: true },
      },
    }),
  ],
});
```

```sh
npm run build
npx --no-install webguard-serve dist --port 4173
```

`webguardApp()`은 기본적으로 Strict/High, SDK 시작, 공개 소스맵 제거, SRI, 정책 생성을 적용합니다. 개발 모드/HMR 동작은 유지됩니다. 입력 제한은 선택적으로 켜는 기능이며, 이 예제에서는 명시적으로 활성화합니다. 생성된 HTTP 정책은 `vite preview`에도 적용됩니다. Vite SSR, 라이브러리 빌드, 메모리 내 빌드는 이 통합의 지원 범위 밖입니다.

기본 정적 정책은 연결을 동일 출처로 제한하고, 지원되는 브라우저에서는 Trusted Types를 강제합니다. 필요한 API는 `headers: { allowedOrigins: { connect: ["https://api.example.com"] } }`처럼 명시적으로 허용하세요. 기존 스크립트·스타일·CSP와의 호환성을 검토하세요. `headers: false`로 자동 정책 처리를 끌 수 있습니다. [정책 가이드 (한국어)](docs/INSTALL.ko.md).

### Next.js App Router

```js
// next.config.mjs
import { withWebGuard } from "uulab-webguard/next";

const nextConfig = { reactStrictMode: true }; // Keep your existing config.
export default withWebGuard(nextConfig, {
  preset: "strict",
  runtime: {
    devtools: { blockShortcuts: true, blockContextMenu: true },
  },
});
```

앱의 빌드 스크립트를 `next build --webpack`으로 설정한 뒤 `npm run build`와 `npm start`(`next start`)를 실행하세요. **Next 16 Turbopack은 지원하지 않습니다.** 프로덕션 브라우저 청크만 변환하며, SSR, RSC, API, Node/Edge 서버 코드와 개발 모드는 제외합니다. `public/`의 직접 제공 스크립트는 별도로 에셋 보호를 적용해야 합니다.

어댑터는 기존 CSP를 보존하며 CSP, SRI, HTTP 헤더를 생성하지 **않습니다**. 요청별 nonce와 하이드레이션은 애플리케이션에 맞춰 조정하세요. `.next` 디렉터리 전체를 후처리하지 마세요. [실행 가능한 SSR 예제 및 제한 사항](examples/next-ssr/README.md).

### Webpack, esbuild 및 일반 정적 HTML

기존 빌드에서 `dist`를 생성한 뒤 파이프라인에 다음 단계를 추가하세요.

```sh
npx --no-install webguard protect-app dist --output dist-protected --preset strict --trusted-types report-only
npx --no-install webguard-serve dist-protected --port 4173
```

**`dist-protected`만 배포하세요.** 이 명령은 SDK를 초기화하고, 선택된 JavaScript를 변환하고, 공개 소스맵을 제거하고, 정적 HTML에 SRI를 추가하고, 정책을 출력합니다. Vite는 필요하지 않습니다. 원한다면 `--restrict-shortcuts --restrict-context-menu`를 추가하세요. 이 예제는 로더 호환성을 위해 Trusted Types report-only를 사용합니다. 실제 HTTP 헤더가 필요하며 Trusted Types를 강제하지는 않습니다.

입력은 보존하며 이미 존재하는 출력 대상은 거부합니다. 다음 빌드에는 새 출력 디렉터리를 사용하세요. 일반 후처리는 파일명을 유지하므로 원래 콘텐츠 해시가 더 이상 유효하지 않을 수 있습니다. 버전이 지정된 배포 경로나 재검증을 사용하고, 서비스 워커 사전 캐시·외부 SRI·서명을 최종 보호 처리된 바이트에 맞춰 갱신하세요.

정적 HTML의 일반 스크립트 및 모듈 인라인 스크립트는 해당 위치에서 변환합니다. 임의의 런타임 생성 코드, 인라인 이벤트 핸들러, 서버 템플릿 삽입 코드는 재귀적으로 난독화하지 않습니다. 외부 파일로 분리하고 CSP 관리 주체를 정하세요. 이 명령에 서버 프로젝트 루트를 전달하지 마세요.

### Java / JSP, Python 및 PHP 서버 렌더링

에셋 빌드 프로젝트에 후보 버전을 설치한 뒤, 서버 소스가 아닌 **브라우저 에셋**을 보호하세요.

```js
// protect-assets.mjs — Node only
import { protectDirectory } from "uulab-webguard/build";

await protectDirectory("browser-assets", {
  output: "browser-assets-protected",
  config: { preset: "strict" },
});
```

```sh
node protect-assets.mjs
```

이 저수준 API는 빌드 보호만 수행합니다. 독립 실행형 SDK와 외부 초기화 파일을 입력에 포함한 뒤, 최종 에셋을 SDK → 초기화 → 앱 순서로 연결하세요. 신뢰할 수 있는 비공개 매니페스트에서 최종 SRI를 읽으세요. 서버 응답 헤더와 비공개 파일 제한은 별도로 적용하고, 매니페스트·보고서·서버 소스는 공개 루트 밖에 두세요.

- **Java / JSP:** [JSP include + Servlet Filter 예제](examples/jsp-servlet/README.md)를 따르세요. Java 17 이상, Maven, Tomcat 10.1 / Jakarta Servlet 6을 사용합니다.
- **Python:** [WSGI 예제](examples/ssr-templates/README.md)를 따르고, 정적 경로와 헤더를 프레임워크에 맞게 조정하세요.
- **PHP:** [PHP 라우터 예제](examples/ssr-templates/README.md)를 따르고, PHP-FPM / Apache에 맞게 조정하세요.

Java, JSP, Python, PHP 소스는 JavaScript 난독화기에 입력되지 않습니다. 템플릿의 인라인 스크립트는 자동 변환하지 않습니다. 서버에서 렌더링한 HTML과 데이터는 계속 볼 수 있습니다. 프레임워크별 배포는 별도의 런타임 검증이 필요하며, 네이티브 Nuxt/Angular SSR 어댑터는 없습니다.

### SDK 직접 다운로드 또는 CDN

[다운로드 페이지](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 **직접 호스팅할 파일** 또는 **일치하는 SRI가 제공되는 고정 CDN URL**을 선택하세요. 직접 호스팅하는 SDK는 다음과 같이 연결합니다.

```html
<script src="/assets/webguard.global.js" defer></script>
<script src="/assets/webguard-init.js" defer></script>
<script src="/assets/app.js" defer></script>
```

```js
// /assets/webguard-init.js — external file
const guard = WebGuardSDK.WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
// Call guard.destroy() when this manually owned instance is no longer needed.
```

독립 실행형 파일을 로드하는 것만으로는 초기화되지 않습니다. CDN을 사용할 때는 CSP에 정확한 출처를 허용하고 URL과 SRI를 함께 갱신하세요. CDN 로드는 빌드 난독화, 자체 에셋의 SRI, 서버 헤더, 권한 검사를 추가하지 않습니다. 빌드 통합이 이미 가드를 시작했다면 두 번째 가드를 초기화하지 마세요.

## 앱 실행 중 가드 변경

Vite가 자동으로 시작한 인스턴스에는 시작 이후 브라우저에서 안전하게 사용할 수 있는 클라이언트 API를 사용하세요.

```ts
import { getWebGuard } from "uulab-webguard/client";

const guard = getWebGuard();
guard?.update({ devtools: { blockShortcuts: false, blockContextMenu: false } });
const currentPolicy = guard?.getOptions();
```

일반 통합에서는 `WebGuardSDK.getAutoGuard()`를 사용하세요. Next는 [Next 전용 브라우저 내보내기](docs/API_INTEGRATIONS.ko.md)를 참고하세요. DOM 무결성과 실행 지연 모니터링은 선택적 참고 신호입니다. DOM 기준선은 하이드레이션 이후 안정적인 콘텐츠에만 설정하세요. [함수, 옵션, 이벤트 및 오류 (한국어)](docs/API.ko.md).

## 배포 제공 및 검증

포함된 Node 서버는 생성된 정적 헤더와 비공개 경로 규칙을 적용합니다. 다른 서버/CDN에서는 해당 규칙을 명시적으로 구현하세요. HTML 메타 태그는 `frame-ancestors` 같은 HTTP 전용 제어를 제공할 수 없습니다. 프로덕션 적용 전에 출처와 프레임워크 호환성을 검증하세요.

```sh
npx --no-install webguard-check dist-protected --url https://YOUR-SITE.example/
```

Vite 예제에서는 `dist`를 사용하세요. 이 명령은 배포된 에셋·진입점 바이트, 실제 응답 헤더, 알려진 비공개 파일·소스맵 경로를 신뢰할 수 있는 빌드와 비교합니다. 실패 시 종료 코드는 1입니다. 애플리케이션 전체의 취약점 검사 도구는 아닙니다.

## 소스에서 실행 및 기여

```sh
git clone https://github.com/bonjin-app/webguard.git
cd webguard
pnpm install --frozen-lockfile
pnpm demo
```

이 소스 워크스페이스는 Node 22.13 이상과 pnpm 11.10.0을 사용하세요. 설치한 패키지 사용 환경은 Node 22.12 이상입니다. `http://127.0.0.1:4173`을 열면 됩니다. 검증 명령은 다음과 같습니다.

```sh
pnpm verify
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

[프로덕션 후보 기준 (한국어)](docs/PRODUCTION_READINESS.ko.md) · [지원·업데이트·롤백 (영어)](docs/SUPPORT.md)

[기술 가이드](docs/TECHNICAL_GUIDE.en.md) · [설치 가이드 (한국어)](docs/INSTALL.ko.md) · [환경 가이드 (한국어)](docs/ENVIRONMENTS.ko.md) · [아키텍처](ARCHITECTURE.md) · [위협 모델](THREAT_MODEL.md) · [보안 정책](SECURITY.md) · [변경 내역](docs/CHANGELOG.md)

네 언어의 README는 모두 동일한 설치 경로를 다룹니다. 상세 API·옵션 레퍼런스는 현재 한국어로 제공됩니다. WebGuard 원본 코드는 [MIT 라이선스](LICENSE)를 따릅니다. 의존성에는 각각의 라이선스가 적용되며, javascript-obfuscator는 BSD-2-Clause입니다. [제삼자 고지](THIRD_PARTY_NOTICES.md)를 참고하세요.
