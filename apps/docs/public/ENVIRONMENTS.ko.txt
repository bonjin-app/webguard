# 환경별 WebGuard 적용

WebGuard는 웹 앱에 설치하는 SDK와 빌드 보호 도구입니다. Vite 전용 서비스가 아니며 웹사이트는 보호 전후를 확인하는 데모입니다. 새 기능은 **게시하지 않은 0.3.0 로컬 후보** 기준입니다. npm 배포는 보류 중이며 검토한 로컬 `.tgz`로 설치합니다. [전체 설치 안내](INSTALL.ko.md).

| 환경                           | 연결 방법                                   | 지원 경계                                                          |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------ |
| Vite 7/8 브라우저 앱           | `webguardApp()` 한 번 설정                  | 개발/HMR 제외. SSR·라이브러리 빌드 제외                            |
| Webpack 정적 웹 앱             | 빌드 후 `protect-app` 또는 `/build` API     | Webpack 전용 플러그인은 아님. 최종 파일 후처리                     |
| esbuild 정적 웹 앱             | 빌드 후 같은 후처리                         | 모듈·동적 import의 최종 실행을 확인                                |
| 일반 HTML·JavaScript           | 정적 디렉터리를 `protect-app`으로 처리      | 인라인 스크립트·이벤트 속성은 외부화                               |
| React + Vite                   | 브라우저 빌드에 `webguardApp()`             | SSR 서버 빌드에는 적용하지 않음. React SSR은 아래 Next 예제로 검증 |
| Next.js App Router + Webpack   | `withWebGuard()`                            | 운영 클라이언트 청크만 변환. 개발·Node·Edge 서버 컴파일 제외       |
| JSP + Java Servlet             | 보호된 외부 자산 + JSP SRI include + Filter | 실제 JSP 컴파일·Servlet API·응답 정책·브라우저 예제 제공           |
| Python WSGI·PHP                | 보호된 외부 자산 + 서버 렌더링 예제         | 서버 소스는 유지. 실제 런타임별 검증 결과는 아래 기록 참조         |
| ASP.NET·Nginx                  | 정적 자산 보호 + 서버 정책 레시피           | 레시피 제공. 해당 서버 실행 검증은 별도                            |
| Nuxt·Angular 등                | 정적 출력이 있는 경우 조건부 후처리 검토    | 네이티브 SSR 어댑터·hydration 자동 지원을 주장하지 않음            |
| 다른 번들러·정적 사이트 생성기 | 실제 HTML·JS 출력에 범용 API 적용           | 자체 해시·프리캐시·서명·동적 URL 계약을 별도 점검                  |

## 한 번 연결하는 후처리

이 경로는 **정적 브라우저 출력**용입니다. `.next` 전체, Python·PHP·JSP 프로젝트 루트, Java 클래스·JAR·WAR를 입력으로 지정하지 마세요. 서버가 실행하는 코드와 브라우저가 실행하는 JavaScript는 서로 다른 보호 대상입니다.

```js
// scripts/protect.mjs — Node에서 실행
import { protectAppDirectory } from "uulab-webguard/build";

await protectAppDirectory("dist", {
  output: "dist-protected",
  config: { preset: "strict" },
  runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
  headers: { trustedTypes: "report-only" },
});
```

기존 빌드 명령 다음에 `node scripts/protect.mjs`를 실행하고 `dist-protected`만 배포합니다. `/build` 진입점은 Vite 설치를 요구하지 않습니다. 목적지가 이미 있으면 실패하므로 빌드별 새 출력 경로를 쓰거나 이전 결과를 보관하세요. 실패한 실행이 기존 출력과 원본 입력을 덮어쓰지 않습니다.

범용 후처리는 빌드 도구가 만든 파일명을 유지합니다. 파일명의 `[contenthash]`는 보호 전 바이트를 가리킬 수 있으며, 난독화 시드나 엔진 버전이 바뀌면 같은 파일명에 다른 보호 코드가 생길 수 있습니다. 같은 자산 URL에 장기 `immutable` 캐시를 적용하지 마세요. 릴리스별 배포 경로를 사용하거나 재검증·`no-store` 정책을 적용하고, 최종 해시 이름이 필요하면 빌드 파이프라인에서 참조·매니페스트까지 함께 갱신해야 합니다.

CLI도 제공합니다.

```sh
npx --no-install webguard protect-app dist --output dist-protected --preset strict --restrict-shortcuts --restrict-context-menu --trusted-types report-only
npx --no-install webguard-serve dist-protected --port 4173
npx --no-install webguard-check dist-protected --url http://127.0.0.1:4173/
```

기본은 Strict이며 입력 제한은 별도로 켜야 합니다. `--no-runtime`은 자동 SDK만, `--no-headers`는 정책 생성만 끕니다. `webguard protect`·`protectDirectory()`는 SDK·정책 자동 통합을 하지 않는 빌드 보호 경로입니다.

## 자동 연결과 수동 SDK

실제 정적 HTML의 앱 스크립트보다 먼저 외부 SDK를 시작하고, 선택된 JavaScript를 난독화합니다. 공개 소스맵을 제거하며 **최종** 자산의 SRI와 SHA-384 매니페스트를 만듭니다. HTTP 정책은 `webguard-headers.json`·`_headers`로 출력합니다. HTML 메타가 지원하는 CSP와 실제 HTTP 헤더의 역할은 다릅니다. 호스트에서 HTTP 정책과 비공개 경로 제한을 적용해야 합니다.

SDK만 수동으로 설치하면 난독화·SRI·헤더가 생기지 않습니다. 독립 SDK 파일 `uulab-webguard/browser.global.js`를 공개 자산 경로로 복사하세요. 파일을 읽는 것만으로 시작되지는 않습니다. HTML에는 SDK와 외부 초기화 파일을 앱보다 먼저 연결합니다.

```html
<script src="/assets/webguard.global.js"></script>
<script src="/assets/guard-init.js"></script>
<script src="/assets/app.js" defer></script>
```

```js
// assets/guard-init.js — 인라인 HTML에 넣지 않습니다.
const guard = WebGuardSDK.WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
// 화면 수명 주기가 끝나면 guard.destroy()
```

범용 자동 통합은 `assets/webguard-runtime.js`에서 SDK를 시작합니다. 자동 시작된 인스턴스는 `WebGuardSDK.getAutoGuard()`로 조회해 `update()`·`destroy()`할 수 있습니다. 별도 `WebGuard.init()`을 중복 호출하지 마세요. Vite 통합은 `/client`의 `getWebGuard()`를 사용합니다.

## React와 Next.js SSR

React + Vite의 브라우저 앱은 기존 `webguardApp()`을 사용합니다. 서버 렌더링이 있는 경우 브라우저 빌드에만 연결하고 서버 번들은 그대로 둡니다. 브라우저 SDK를 서버 요청마다 초기화하거나 서버 전역에 사용자별 인스턴스를 보관하지 마세요. React의 JSX·컴포넌트 이름을 직접 난독화하는 것이 아니라 컴파일된 브라우저 JavaScript를 변환합니다.

Next.js는 전용 진입점을 사용합니다. 아래 API도 **미게시 로컬 후보** 기준입니다.

```js
// next.config.mjs
import { withWebGuard } from "uulab-webguard/next";

export default withWebGuard(
  { reactStrictMode: true }, // 기존 Next 설정
  {
    preset: "strict",
    runtime: {
      devtools: {
        detect: false,
        blockShortcuts: true,
        blockContextMenu: true,
      },
    },
  },
);
```

```json
{ "scripts": { "build": "next build --webpack", "start": "next start" } }
```

운영 클라이언트 컴파일에 SDK를 연결하고 청크를 난독화합니다. SSR·React Server Components·Route Handler·Node/Edge 서버 코드와 개발/HMR은 변환하지 않습니다. 기존 동기 Webpack 설정 콜백은 유지합니다. Next 자체가 기다리지 않는 비동기 Webpack 콜백은 오류로 안내합니다. 비동기 준비는 Next 설정 함수에서 완료한 뒤 결과 객체를 `withWebGuard()`로 감싸세요. `runtime: false`는 SDK 자동 시작을 끄며 난독화와 구분됩니다.

앱 코드가 포함되거나 출처가 불명확한 청크는 선택한 프리셋을 그대로 사용합니다. 모듈 그래프 전체가 외부 프레임워크·의존성 코드임을 확인한 청크는 기본적으로 최대 Standard로 변환해 비용을 줄입니다. Basic을 선택하면 외부 코드도 Basic입니다. `frameworkPreset: "inherit"`를 지정하면 외부 코드도 앱과 같은 프리셋을 사용합니다. 모든 청크를 Strict로 변환하면 React·Next 공통 코드까지 크게 늘어날 수 있으므로 실제 전송량과 초기 실행 시간을 확인하세요. 난독화 프리셋은 보안 등급을 뜻하지 않습니다.

`public/`에 직접 넣은 JS와 HTML 안의 인라인 Flight 데이터는 이 컴파일의 대상이 아닙니다. 앱 JS는 클라이언트 소스에서 import해 번들에 포함하거나 자산 전용 보호 단계를 구성하세요. 사용자에게 전송한 SSR 데이터·HTML을 숨기는 기능은 아닙니다. 공개 소스맵을 요청하는 설정은 충돌 오류로 안내합니다.

Next 16의 Turbopack 빌드에는 이 Webpack 연결이 적용되지 않습니다. **`--webpack`이 필요합니다.** 빌드 전체 `.next` 후처리는 지원 방식이 아닙니다. CDN·커스텀 플러그인·서비스 워커·외부 서명/SRI는 최종 바이트와 맞는지 별도 검증하세요.

Next 연결은 Vite의 정적 HTML 주입 경로와 다릅니다. CSP·SRI·HTTP 정책을 자동 생성하거나 기존 정책을 덮어쓰지 않습니다. Next의 인라인 bootstrap·스트리밍·요청별 nonce 계약을 유지해야 합니다. 기존 CSP를 적용한 상태에서 hydration과 클라이언트 이동을 검증하세요. nonce를 사용하면 요청마다 새로 생성해 서버 요청 헤더·응답 CSP·프레임워크에 일관되게 전달해야 합니다. 고정 nonce나 무조건적인 `unsafe-inline` 추가로 해결하지 마세요. [공식 Next CSP 안내](https://nextjs.org/docs/app/guides/content-security-policy), [Webpack 연결](https://nextjs.org/docs/app/api-reference/config/next-config-js/webpack).

실행 예제: [examples/next-ssr](../examples/next-ssr/README.md). SSR HTML, hydration 이후 상태 변경, 동적 import와 페이지 이동, 서버 API, SDK 실시간 변경을 검증합니다. 버전과 실제 통과 범위는 검증 기록을 확인하세요. 이 예제의 결과를 모든 React·Next 버전·라우터·배포 플랫폼 지원으로 확대하지 않습니다.

## JSP·Java·Python·PHP의 서버 렌더링

공통 연결은 다음과 같습니다.

1. 브라우저용 JS와 외부 SDK 초기화 파일을 자산 전용 디렉터리에서 빌드·난독화합니다.
2. 최종 JS의 SHA-384 SRI를 생성하고 서버 템플릿의 외부 `<script>` 태그에 연결합니다.
3. 공개 루트에는 필요한 브라우저 자산만 복사합니다. 소스맵·보고서·기준 매니페스트·서버 설정은 밖에 둡니다.
4. 서버는 HTML·자산·오류 응답의 HTTP 정책을 적용합니다. 실제 앱의 기존 CSP와 합의한 정책을 사용하세요.

JSP·Java·Python·PHP 소스는 JavaScript 난독화기에 넣지 않습니다. 정상적인 SSR에서는 브라우저에 해당 서버 원본이 전달되지 않습니다. 서버가 렌더링한 HTML·JSON·사용자에게 보낸 데이터는 그대로 관찰할 수 있습니다. 템플릿 안의 인라인 JavaScript도 자동 변환하지 않으므로 외부 파일로 분리하세요.

### JSP + Java Servlet

```sh
pnpm build
node scripts/prepare-jsp.mjs
mvn -B -f examples/jsp-servlet/pom.xml package
# 저장소의 세 브라우저 엔진까지 검증하려면
mvn -B -f examples/jsp-servlet/pom.xml -Dwebguard.browser=true package
```

[JSP 예제](../examples/jsp-servlet/README.md)는 Java 17·Jakarta Servlet 6·Tomcat 10.1용입니다. 보호된 SDK·앱 JS만 공개하고 최종 SRI include는 `WEB-INF` 안에 생성합니다. `WebGuardFilter`가 응답 정책과 예제 경로 허용 목록을 적용합니다. 기존 서비스에는 허용 경로와 정책을 맞춰 통합해야 합니다. 예제 허용 목록을 그대로 운영 서비스 전체에 적용하지 마세요. Java 자체의 클래스 난독화나 서버 취약점 점검을 제공하는 예제는 아닙니다.

### Python·PHP

[SSR 템플릿 예제](../examples/ssr-templates/README.md)는 같은 보호 자산을 Python WSGI와 PHP가 각각 서버에서 렌더링해 연결합니다. 서버에서 출력한 문자열은 HTML 문맥에 맞게 이스케이프하고, 정책·SRI 파일은 신뢰하는 비공개 빌드 결과에서 읽습니다. Flask·Django·FastAPI·Laravel 등의 프로젝트도 이 자산 분리 원칙을 적용할 수 있지만 해당 프레임워크 전용 자동 어댑터를 제공한다는 뜻은 아닙니다.

검증 결과는 [SSR 검증 기록](SSR_VERIFICATION.md)에서 런타임·버전·브라우저별로 구분합니다. Python WSGI 결과는 Django 전용 미들웨어 검증을 뜻하지 않으며 PHP 인터프리터 결과는 PHP-FPM·Apache·운영 인증까지 보증하지 않습니다.

## 배포 전에 확인할 것

### CSS Modules 식별자와 SSR 매핑

미게시 후보에서 Vite는 `webguardApp({ domIdentifiers: true })`, Next Webpack은 `withWebGuard(config, { domIdentifiers: true })`로 운영 CSS Modules 클래스 이름을 불투명하게 만들 수 있습니다. Next 연결은 서버와 브라우저 컴파일에 같은 생성기를 연결합니다. 서버 HTML과 브라우저 CSS의 이름이 달라지면 스타일·hydration 문제가 생기므로 CSS를 빌드한 뒤 DOM의 문자열만 별도로 바꾸지 마세요.

다른 CSS Modules 파이프라인은 Node 전용 생성기를 명시적으로 공유할 수 있습니다.

```js
import { fileURLToPath } from "node:url";
import { createDomIdentifierGenerator } from "uulab-webguard/build";

const generateName = createDomIdentifierGenerator({
  root: fileURLToPath(new URL("./", import.meta.url)),
});
// 양쪽 컴파일러에 같은 프로젝트 루트와 소스 파일 경로 규칙을 사용합니다.
// 컴파일러의 콜백 인자 순서에 맞춰 연결하세요.
const className = generateName("notice", "/absolute/project/Notice.module.css");
```

`root`와 CSS 파일명은 절대 경로이며 이름은 프로젝트 기준 상대 파일 경로·로컬 클래스 이름에서 결정됩니다. 동일한 프로젝트 구조와 규칙을 SSR·클라이언트에 사용하세요. Vite의 수동 연결은 `css.modules.generateScopedName: generateName`입니다. 수동 생성기와 `domIdentifiers: true`를 중복 설정하지 마세요. Vite의 Lightning CSS·Next Turbopack·실험적인 Lightning CSS 연결은 이 자동 옵션의 대상이 아닙니다. 사용자 정의 생성기와 충돌하면 자동으로 덮어쓰지 않고 오류를 냅니다.

범위는 CSS Modules 클래스이며 임의의 ID, 전역 CSS, 템플릿 선택자, 폼 이름이나 DOM 구조를 변경하지 않습니다. JSP·Python·PHP의 기존 정적 HTML과 전역 CSS에 이 옵션만 추가해서 이름이 바뀌지는 않습니다. CSS Modules를 사용하는 기존 프런트엔드 컴파일 단계에서 연결해야 합니다. 생성 이름에 기대는 외부 스타일·자동화 선택자는 함께 점검하세요. 난독화된 이름도 Elements·Styles에서 열람할 수 있습니다.

### SSR 이후의 선택적 런타임 검사

브라우저 SDK의 `debugging`과 `domIntegrity`는 모두 기본 OFF입니다. 실행 지연은 자동 관찰과 명시적인 한 번 검사 중에서 선택할 수 있습니다. Vite·Next 빌드 설정 한 곳에서 다음 브라우저 정책을 전달하면 SDK 시작 후 관찰합니다.

```js
const runtime = {
  debugging: {
    enabled: true,
    watch: true,
    intervalMs: 1000,
    thresholdMs: 1500,
    response: "report",
  },
};
// Vite 설정의 플러그인: webguardApp({ runtime })
// Next 설정: withWebGuard(existingNextConfig, { runtime })
```

`watch`는 기본 false이고 자동 관찰의 전체 간격 `intervalMs`는 기본 1,000ms·범위 250~60,000ms입니다. 보이는 페이지에서 타이머 하나로 다음 기한을 이어 관찰하며, 늦게 돌아온 시간이 추가 임계값을 넘으면 신호를 냅니다. 페이지 숨김·`pagehide` 시 기한을 취소하고 다시 보이거나 `pageshow` 시 새 기한을 시작하므로 숨겨진 시간을 신호로 계산하지 않습니다. 연속 지연 콜백의 이벤트는 정상 표본 또는 재시작 전까지 중복 억제합니다. `debugger` 트랩이나 0ms 반복 루프를 삽입하지 않습니다.

실행이 정지된 동안에는 SDK도 멈추므로 신호는 재개 후에만 나옵니다. 단순히 DevTools를 열어 둔 상태는 관찰할 수 없을 수 있으며 CPU 부하·브라우저 스케줄링도 원인이 됩니다. 기본 `report`는 신호만 알리고, 선택적인 `block`은 페이지 UI 반응입니다. DevTools를 닫거나 JavaScript 실행을 멈추지 않습니다. 우리 공개 사이트는 체험 정책으로 자동 관찰의 `report`를 켜며, 소비자 SDK의 기본값과 구분합니다.

브라우저에서 `/client`의 `getWebGuard()?.getDebuggingState()`로 `state`, `samples`, `lastCheckedAt`, `lastDelayMs`, `lastSuspicionAt`을 조회합니다. 상태는 `off`·`manual`·`watching`·`suspended`·`unavailable`이며 통계는 자동 관찰 표본에 한정합니다. 관련 관찰 정책 변경 시 초기화되고, 반환된 메타데이터 자체가 보안 판정은 아닙니다. SSR 요청에서 이 브라우저 API를 호출하지 마세요.

`debugging: { enabled: true, watch: false, response: "report" }`는 수동 모드입니다. `await guard.checkDebugging()`을 호출하면 보이는 페이지에서 표본 하나를 검사합니다. 자동 관찰과 독립적으로 한 번에 수동 표본 하나만 실행되며 `false`에는 비활성화·취소·숨김 상태도 포함됩니다. SDK 전체 검사를 끄려면 `enabled: false`로 바꿉니다.

`domIntegrity: { enabled: true, selectors: ["#static-notice"], response: "report" }`는 선택한 첫 일치 정적 앵커의 변경·이동·삭제·교체를 관찰합니다. 서버에서 SDK를 실행하거나 SSR 템플릿을 변경하지 않습니다. 가드가 준비되고 hydration·마운트가 끝난 뒤 정책을 켜고 `guard.rebaselineDom()`으로 현재 정적 내용을 기준으로 잡으세요. 요소 없음은 오류이며 자동으로 마운트 완료를 기다려 성공 처리하지 않습니다. 불일치·오류 후에는 관찰을 멈추므로 신뢰하는 상태에서 명시적으로 새 기준을 잡아야 재개합니다. 동적 폼·카운터·목록에는 연결하지 마세요.

앱이 허용한 DOM 직접 변경 뒤에는 같은 동기 작업에서 기준을 갱신합니다. 프레임워크 비동기 변경은 `setState()` 직후가 아니라 실제 커밋 직후의 `useLayoutEffect` 등에서 동기적으로 갱신해야 관찰 알림 전에 새 기준을 반영할 수 있습니다. `response: "block"`은 페이지 안내로 상호작용을 제한하는 선택 기능이며 개발자도구를 닫거나 서버 권한을 보호하지 않습니다. DOM 내용은 이벤트로 전송하지 않습니다. 세부 예제·기본값·한도·해제 방법은 [설치 가이드](INSTALL.ko.md#9-선택-기능-css-식별자와-런타임-신호)를 참고하세요.

인라인 스크립트·이벤트 속성은 외부화하세요. 기존 CSP와 자동 정책이 충돌하면 정책 소유자를 정해야 하며 자동으로 약화하지 않습니다. `trustedTypes: "report-only"`는 문자열 DOM 삽입의 강제를 관찰로 전환하지만 인라인 실행 허용이나 정화를 제공하지 않습니다. report-only는 실제 HTTP 헤더가 필요합니다.

출력에 서버 코드·환경 파일·원본 소스·비밀값을 넣지 마세요. 원본 소스맵은 공개 루트 밖에 보관합니다. 서비스 워커·프리캐시·외부 SRI·서명 매니페스트는 후처리한 최종 바이트로 갱신해야 합니다. 서버 템플릿은 자동 HTML 주입 대신 정적 자산 연결과 서버 헤더 레시피를 사용하세요. [서버 예제](../examples/server-templates/README.md).

검증은 별개의 증거로 기록합니다. 실제 Webpack·esbuild·일반 HTML 소비자 빌드와 Chromium·Firefox·WebKit 실행 결과는 해당 검증 영수증을 확인하세요. 이 문서의 적용법 자체가 실행 성공의 증거는 아닙니다. ASP.NET·Nginx·물리 Safari·Chrome과 각 운영 배포 플랫폼 검증은 별도입니다.

개발자도구 창과 전달된 리소스를 숨기지 않습니다. F12·Mac Cmd+Option+I/J/C·Ctrl+Shift+I/J/C 제한은 페이지에 전달된 이벤트에만 적용되며 편집 필드는 제외합니다. 가격·권한·입력 검증은 앱 서버에서 수행해야 합니다.
