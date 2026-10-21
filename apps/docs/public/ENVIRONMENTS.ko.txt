# 환경별 WebGuard 적용

WebGuard는 웹 앱에 설치하는 SDK와 빌드 보호 도구입니다. Vite 전용 서비스가 아니며 웹사이트는 보호 전후를 확인하는 데모입니다. 새 기능은 **게시하지 않은 0.3.0 로컬 후보** 기준입니다. npm 배포는 보류 중이며 검토한 로컬 `.tgz`로 설치합니다. [전체 설치 안내](INSTALL.ko.md).

| 환경                           | 연결 방법                                | 지원 경계                                                              |
| ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------- |
| Vite 7/8 브라우저 앱           | `webguardApp()` 한 번 설정               | 개발/HMR 제외. SSR·라이브러리 빌드 제외                                |
| Webpack 정적 웹 앱             | 빌드 후 `protect-app` 또는 `/build` API  | Webpack 전용 플러그인은 아님. 최종 파일 후처리                         |
| esbuild 정적 웹 앱             | 빌드 후 같은 후처리                      | 모듈·동적 import의 최종 실행을 확인                                    |
| 일반 HTML·JavaScript           | 정적 디렉터리를 `protect-app`으로 처리   | 인라인 스크립트·이벤트 속성은 외부화                                   |
| JSP·PHP·ASP.NET                | 정적 자산 보호 + 외부 SDK + 서버 헤더    | 템플릿은 난독화하지 않음. 서버 예제는 실행 미검증 레시피               |
| Next.js·Nuxt·Angular 등        | 정적 출력이 있는 경우 조건부 후처리 검토 | 네이티브 어댑터·SSR·미들웨어·nonce·hydration 자동 지원을 주장하지 않음 |
| 다른 번들러·정적 사이트 생성기 | 실제 HTML·JS 출력에 범용 API 적용        | 자체 해시·프리캐시·서명·동적 URL 계약을 별도 점검                      |

## 한 번 연결하는 후처리

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

## 배포 전에 확인할 것

인라인 스크립트·이벤트 속성은 외부화하세요. 기존 CSP와 자동 정책이 충돌하면 정책 소유자를 정해야 하며 자동으로 약화하지 않습니다. `trustedTypes: "report-only"`는 문자열 DOM 삽입의 강제를 관찰로 전환하지만 인라인 실행 허용이나 정화를 제공하지 않습니다. report-only는 실제 HTTP 헤더가 필요합니다.

출력에 서버 코드·환경 파일·원본 소스·비밀값을 넣지 마세요. 원본 소스맵은 공개 루트 밖에 보관합니다. 서비스 워커·프리캐시·외부 SRI·서명 매니페스트는 후처리한 최종 바이트로 갱신해야 합니다. 서버 템플릿은 자동 HTML 주입 대신 정적 자산 연결과 서버 헤더 레시피를 사용하세요. [서버 예제](../examples/server-templates/README.md).

검증은 별개의 증거로 기록합니다. 실제 Webpack·esbuild·일반 HTML 소비자 빌드와 Chromium·Firefox·WebKit 실행 결과는 해당 검증 영수증을 확인하세요. 이 문서의 적용법 자체가 실행 성공의 증거는 아닙니다. PHP·ASP.NET·Nginx·Tomcat 실제 서버와 물리 Safari·Chrome 검증은 별도입니다.

개발자도구 창과 전달된 리소스를 숨기지 않습니다. F12·Mac Cmd+Option+I/J/C·Ctrl+Shift+I/J/C 제한은 페이지에 전달된 이벤트에만 적용되며 편집 필드는 제외합니다. 가격·권한·입력 검증은 앱 서버에서 수행해야 합니다.
