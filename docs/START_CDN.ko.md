# CDN · 파일 다운로드로 WebGuard 시작하기

**빌드 도구 없이 브라우저 런타임 가드만 연결**하는 방법입니다. 앱 JavaScript의 자동 난독화는 [HTML·jQuery 적용](START_HTML.ko.md) 또는 [정적 빌드 적용](START_STATIC.ko.md)을 선택하세요.

## 준비 사항

- HTML 공통 레이아웃과 정적 JS 파일을 수정할 권한이 필요합니다.
- 이 방법은 Node·npm 설치가 필요하지 않습니다.
- 이미 Vite·Next·정적 빌드 통합이 SDK를 자동 시작한다면 수동 SDK를 중복 설치하지 마세요.

## 1. 설치 방식 선택

[다운로드 화면](https://webguard.uulab.co.kr/docs/#sdk-downloads)을 엽니다. 아래 **하나만** 선택합니다.

| 방식          | 가져올 항목                                          | 파일을 놓는 위치             |
| ------------- | ---------------------------------------------------- | ---------------------------- |
| CDN           | 고정 SDK URL·SRI가 포함된 스크립트 태그, 초기화 예제 | 초기화 파일만 내 서버에 저장 |
| 직접 다운로드 | 독립 SDK JavaScript, 초기화 예제                     | 두 파일 모두 내 서버에 저장  |

두 방식 모두 독립 브라우저 SDK입니다. `.tgz`는 Node 빌드 도구 패키지이므로 이 경로에서는 필요하지 않습니다. 다운로드 후보 제공과 npm 게시 여부는 별개이며 npm 게시는 보류 중입니다.

## 2. 초기화 파일과 HTML 수정

내 사이트의 정적 경로 `/assets/webguard-init.js`에 외부 초기화 예제를 저장합니다. 공통 레이아웃 안에 인라인으로 붙이지 않습니다.

직접 간단히 시작하려면 같은 파일을 다음 내용으로 만드세요.

```js
window.webguard = WebGuardSDK.WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
```

다운로드 초기화 예제와 위 코드를 동시에 넣지 마세요. SDK가 한 번만 시작되어야 합니다. 화면을 완전히 종료할 때는 인스턴스의 `destroy()`로 정리할 수 있습니다.

### CDN 선택 시

1. 다운로드 화면의 **CDN 연결 태그**를 그대로 복사합니다. 고정 URL·정확한 `integrity`·`crossorigin="anonymous"`가 함께 있어야 합니다.
2. 내 HTML 공통 레이아웃의 앱 스크립트 **앞**에 붙입니다. 복사한 외부 초기화 태그의 경로를 `/assets/webguard-init.js`와 맞춥니다.
3. 앱 스크립트도 `defer`로 연결합니다. 최종 순서는 **SDK → 외부 초기화 → 앱**입니다. `async`를 섞으면 이 순서를 보장하지 않습니다.

예시의 가짜 SRI나 `latest` URL을 직접 만들지 마세요. 다운로드 화면은 현재 검토 후보에 대응하는 고정 태그를 제공합니다.

### 직접 다운로드 선택 시

1. SDK를 내 서버의 `/assets/webguard.global.js`에 저장합니다.
2. 같은 다운로드 화면의 SDK SRI를 유지하고 `src`만 내 서버 경로로 바꿉니다. 다운로드한 바이트를 다시 편집하거나 압축 변환하지 않습니다.
3. 그 뒤에 `/assets/webguard-init.js`, 마지막으로 앱 JS를 `defer`로 연결합니다.

CDN이 불필요한 서비스는 이 방식으로 SDK를 직접 제공합니다. 서버 경로가 `/app/` 아래라면 태그와 실제 정적 경로를 모두 그 경로에 맞춥니다.

## 3. 배포·실행

정적 파일과 수정한 HTML을 기존 배포 방식으로 함께 배포합니다. 초기화 파일만 먼저 배포하거나 SDK 버전만 바꾸지 마세요.

서버 CSP가 있다면 CDN 사용 시 `script-src`에 `https://webguard.uulab.co.kr`와 내 외부 초기화 파일을 허용해야 합니다. 직접 호스팅은 실제 파일 출처를 허용합니다. **기존 CSP를 지우거나 `unsafe-inline`을 추가하는 것으로 해결하지 마세요.**

HTTP 보안 헤더는 서버에서 따로 적용합니다. [서버 헤더 레시피](https://github.com/bonjin-app/webguard/blob/main/examples/server-templates/README.md)를 참고하세요. SDK 파일 하나로 서버 CSP·인증·권한 검증이 자동 구성되지는 않습니다.

## 4. 정상 결과 확인

1. Network에서 SDK·초기화·앱 JS가 순서대로 로드되고 `200`인지 확인합니다.
2. 콘솔에 `WebGuardSDK is not defined`, SRI·CSP 오류가 없어야 합니다. 위 최소 초기화 코드 사용 시 `window.webguard`가 생성됩니다.
3. 페이지 안에서 우클릭과 페이지로 전달되는 검사 단축키를 시험합니다.
4. 앱의 기존 버튼·로그인·API가 정상 동작하는지 확인합니다.

브라우저 메뉴나 이미 열린 개발자도구는 강제로 닫을 수 없습니다. **CDN SDK를 연결한 것만으로 Sources의 앱 코드가 난독화되지는 않습니다.** 앱 코드 변환은 별도 빌드 통합이 필요합니다.

## 문제 해결

- **SDK가 없다는 오류:** 태그 순서·URL·CSP·SRI 오류를 먼저 확인하세요. 모든 파일에 `async`를 쓰면 실행 순서가 달라질 수 있습니다.
- **SRI 불일치:** 파일을 변환한 프록시를 확인하고 고정 SDK URL과 같은 릴리스의 SRI를 다시 복사하세요.
- **가드가 두 번 반응:** 기존 자동 시작 통합 또는 수동 `init()`의 중복 여부를 확인하세요.
- **태그를 붙였는데 가드가 꺼져 있음:** SDK 로드만으로 시작되지 않습니다. 초기화 파일 요청과 실행 여부를 확인하세요.

## 다음 단계

- 앱 코드도 자동 난독화: [Vite·React](START_VITE.ko.md) · [Next.js](START_NEXT.ko.md) · [HTML·jQuery](START_HTML.ko.md) · [정적 빌드](START_STATIC.ko.md)
- 서버 템플릿: [Java·JSP](START_JAVA.ko.md) · [Python](START_PYTHON.ko.md) · [PHP](START_PHP.ko.md)
- 기능 설정과 함수: [브라우저 SDK 명세](API_BROWSER.ko.md)

업데이트는 **새 고정 URL과 SRI를 함께 선택 → 시험 앱에서 확인 → 앱 배포** 순서로 진행합니다. 이전 고정 URL·SRI·초기화 파일을 함께 보관하면 검증한 이전 상태로 복구하기 쉽습니다.
