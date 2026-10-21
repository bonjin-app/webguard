# JSP·PHP·ASP.NET·Nginx 적용 레시피

이 폴더는 **실제 서버 실행 검증을 하지 않은 통합 예제**입니다. 배포 가능한 전체 서버나 인증 시스템이 아닙니다. JSP의 별도 프로젝트는 [jsp-servlet](../jsp-servlet/README.md)에 있습니다. [환경별 지원 범위](../../docs/ENVIRONMENTS.ko.md)와 [한국어 설치 안내](../../docs/INSTALL.ko.md)를 먼저 확인하세요. 새 API는 게시하지 않은 0.3.0 후보 기준이며 npm 배포는 보류 중입니다.

## 정적 자산과 서버 템플릿 분리

PHP·JSP·Razor·서버 바이너리는 JavaScript 난독화 입력에 넣지 않습니다. 브라우저에 전달할 정적 자산만 별도 디렉터리에서 빌드·보호합니다. 정적 HTML이 있으면 `protect-app`이 SDK와 정책을 연결합니다. 서버가 HTML을 렌더링하면 외부 SDK·외부 초기화 파일·앱 자산을 템플릿에서 순서대로 연결하고 HTTP 헤더는 서버에서 적용하세요.

```html
<script src="/assets/webguard.global.js"></script>
<script src="/assets/guard-init.js"></script>
<script src="/assets/app.js" defer></script>
```

`webguard.global.js`는 설치 패키지의 `uulab-webguard/browser.global.js`를 복사한 파일입니다. 로드만으로 시작되지 않습니다. 아래 코드는 외부 `guard-init.js`에 넣고 앱 자산과 함께 난독화·배포하세요. 인라인 `<script>` 초기화는 기본 CSP와 충돌합니다.

```js
const guard = WebGuardSDK.WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
// 화면 해제 시 guard.destroy()
```

범용 자동 통합에서 생성한 `assets/webguard-runtime.js`를 사용하는 경우에는 직접 초기화하지 않고 `WebGuardSDK.getAutoGuard()`로 기존 인스턴스를 조회합니다. 런타임의 실행에 필요한 상대 경로 구조를 유지하세요. 정적 자산은 `protectDirectory()` 또는 `webguard protect`로 보호할 수도 있지만 이 빌드 전용 경로는 SDK 초기화와 정책 생성을 대신하지 않습니다.

## 정책은 실제 HTTP 응답에 적용

정책 생성 예:

```js
import { writeFile } from "node:fs/promises";
import { createSecurityHeaders } from "uulab-webguard/headers";

const policy = createSecurityHeaders({ trustedTypes: "report-only" });
await writeFile(
  "/absolute/private/webguard-headers.json",
  JSON.stringify(policy),
);
```

자동 빌드에서 생성된 `webguard-headers.json`을 사용해도 됩니다. 정책 파일은 공개 루트 **밖**의 서버 설정 경로로 복사하고 코드·배포 권한으로 보호하세요. 사용자 입력이나 원격 URL에서 읽지 않습니다. 아래 PHP·C# 예제는 정책이 없거나 잘못되면 서버 시작/요청을 실패시키며 조용히 무보호 응답으로 진행하지 않습니다.

- [webguard.php](webguard.php): PHP 8+ 응답 시작 전 포함. `WEBGUARD_HEADERS_FILE`을 공개 루트 밖의 정책 파일로 설정합니다. 정적 파일은 웹 서버에서 별도로 보호합니다.
- [WebGuardHeaders.cs](WebGuardHeaders.cs): ASP.NET Core의 `UseStaticFiles()`·엔드포인트보다 먼저 등록하는 미들웨어입니다. 정책 파일은 `app.Environment.WebRootPath` 밖에 보관하고 `WebGuard:HeadersFile` 설정으로 지정합니다. 호스트의 오류 응답·다른 정적 파일 경로도 점검해야 합니다.
- [nginx.conf](nginx.conf): 서버 블록에 합칠 정적 호스팅 예시입니다. 포트·TLS·루트·정책은 실제 배포에 맞춰 구성합니다. CSP는 앱이 생성한 최종 값으로 맞추고 문서의 예시를 무조건 덮어쓰지 마세요.

`frame-ancestors`와 report-only는 HTML 메타로 대체할 수 없습니다. Trusted Types `report-only`는 차단 대신 관찰하지만 CSP의 인라인 실행 제한을 해제하지 않습니다. 인라인 코드·이벤트 속성은 외부화하거나 기존 정책 소유자가 nonce/hash를 직접 관리해야 합니다. 자동 통합이 nonce를 만들어 서버 템플릿까지 연결한다고 가정하지 마세요.

## 서버 검증 범위

생성된 `_headers`·`webguard-headers.json`·보고서·소스맵·환경/설정/잠금 파일을 공개하지 않습니다. 가능한 한 공개 디렉터리에 브라우저 자산만 배치하고, 웹 서버·CDN·원본 서버에서 같은 거부 규칙을 적용하세요. PHP 요청에서 헤더를 설정해도 웹 서버가 직접 제공하는 JS·CSS 응답에는 자동 적용되지 않습니다.

실제 서버에서 정상 앱 실행, 응답 헤더, 비공개 URL의 404, SRI, API 출처·쿠키·인증·오류 응답을 검증하세요. 프록시·CDN이 자산 바이트를 다시 변환하면 SRI가 깨집니다. 브라우저 SDK는 개발자도구 잠금·서버 권한·가격 검증을 제공하지 않습니다. 로그인과 업무 권한은 서버에서 검증합니다.

범용 후처리는 빌드 파일명을 유지하므로 `[contenthash]` 이름이 보호 전 바이트 기준일 수 있습니다. 난독화 시드·엔진 버전에 따라 최종 바이트가 바뀌어도 URL은 같을 수 있어, 같은 URL에 장기 `immutable` 캐시를 적용하지 마세요. 릴리스별 경로 또는 재검증·`no-store`를 사용하고 최종 파일명을 바꾸는 파이프라인은 모든 참조·매니페스트도 함께 갱신하세요. Nginx 레시피는 이 이유로 `Cache-Control: no-store`를 사용합니다.
