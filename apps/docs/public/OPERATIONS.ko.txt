# WebGuard 운영 가이드

개발에서는 디버깅을 그대로 유지하고, 스테이징에서 관찰한 뒤 검증한 정책만 운영에 적용합니다. 이 문서는 저장소의 미게시 후보 API 기준입니다. npm 게시는 보류 중이므로 설치는 [환경별 시작 가이드](ENVIRONMENTS.ko.md)의 고정 다운로드·패키지 안내를 따르세요.

## 적용 상태 진단

현재 SDK 후보에는 설정값과 실제 실행 상태를 구분하는 `guard.getStatus()`가 있습니다. 수동 연결은 `window.webguard.getStatus()`, 자동 연결은 `getWebGuard()?.getStatus()`로 읽습니다. 개발자도구 콘솔 대신 앱의 진단 화면에도 연결할 수 있습니다.

DOM 감시 오류·변경 감지 후 중지, 종료된 인스턴스, 페이지 안내 표시 실패를 구분합니다. 파일 검사 ready는 명시적 검사 호출이 가능하다는 뜻이며, 난독화·응답 헤더·개발자도구 창 상태의 검증 결과가 아닙니다. [정확한 반환값과 범위](API_BROWSER.ko.md#webguardinstancegetstatus)를 확인하세요.

이 메서드가 없는 과거 SDK를 사용 중이면 [다운로드 화면](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 새 후보를 선택하고 SDK와 SRI를 함께 갱신합니다. 기존 파일의 내용을 덮어써 고정 URL의 의미를 바꾸지 마세요.

## 환경별 적용

| 환경     | 빌드·서버 정책                                           | 브라우저 정책                                       |
| -------- | -------------------------------------------------------- | --------------------------------------------------- |
| 개발     | 원래 개발 서버·원본 디버깅 유지                          | SDK를 연결하지 않거나 아래 개발 정책 사용           |
| 스테이징 | 운영과 같은 빌드·배포 경로에서 기능·성능·헤더·SRI 검증   | 입력 제한 없이 보고부터 시작, 실행 지연 관찰은 선택 |
| 운영     | 검증한 난독화 결과·HTTP 헤더·최종 바이트 SRI를 함께 배포 | 크기·실행 지연 추정으로 기본 차단하지 않음          |

[Vite 통합](START_VITE.ko.md)은 빌드에 적용되며 개발 서버에는 보호를 적용하지 않습니다. [Next 통합](START_NEXT.ko.md)도 운영 Webpack 클라이언트 빌드에 적용됩니다. 개발 중에는 기존 소스맵·중단점·HMR 흐름을 유지하고 수동 SDK를 별도로 추가하지 마세요. 스테이징의 운영 빌드에는 보호가 적용되므로 개발 서버와 구분합니다.

다음 세 예제는 **수동 SDK 연결에서 하나만** 골라 외부 초기화 파일에 저장합니다. [CDN](START_CDN.ko.md)·[JSP](START_JAVA.ko.md)는 `SDK → 초기화 → 앱` 순서로 외부 스크립트를 연결하고 `defer`를 사용합니다. 자동 통합이 이미 SDK를 시작한다면 `init()`을 다시 호출하지 말고 통합의 `runtime` 옵션에 해당 중첩 정책을 적용하세요. `onThreat` 콜백은 시작 후 `getWebGuard()?.update({ onThreat })`로 연결할 수 있습니다.

아래 `WebGuard.init()` 옵션은 런타임 동작만 정합니다. 앱 JavaScript를 난독화하거나 서버 HTTP 헤더·HTML SRI를 생성하지 않습니다. `preset: "strict"`만 추가해도 이러한 빌드 작업이 실행되지 않습니다.

## 1. 개발: 간섭 없이 사용

가능하면 개발 레이아웃에서 SDK·초기화 태그를 생략합니다. 공통 연결을 유지해야 한다면 개발용 외부 초기화 파일을 다음과 같이 둡니다.

```js
window.webguard = WebGuardSDK.WebGuard.init({
  devtools: {
    detect: false,
    blockShortcuts: false,
    blockContextMenu: false,
    response: "monitor",
  },
  debugging: { enabled: false, watch: false, response: "report" },
  domIntegrity: { enabled: false, response: "report" },
  integrity: { enabled: false },
});
```

검사 단축키·우클릭 제한과 크기·지연·DOM 관찰을 모두 끕니다. 기존 인스턴스에 `update({})`를 호출하면 정책이 초기화되지 않으므로, 정책을 바꿀 때는 끌 기능을 명시적으로 `false`로 지정합니다.

## 2. 스테이징: 관찰부터 시작

```js
window.webguard = WebGuardSDK.WebGuard.init({
  devtools: {
    detect: true,
    blockShortcuts: false,
    blockContextMenu: false,
    response: "monitor",
  },
  debugging: {
    enabled: false,
    watch: false,
    response: "report",
    thresholdMs: 1500,
    intervalMs: 1000,
  },
  domIntegrity: { enabled: false, response: "report" },
  integrity: { enabled: false },
  onThreat(event) {
    console.info("[WebGuard]", event.type, event.timestamp);
  },
});
```

실행 지연도 관찰하려면 `debugging.enabled`와 `debugging.watch`를 **둘 다 `true`**로 바꿉니다. `response: "report"`를 유지하고 느린 기기·CPU 부하·탭 전환·절전 복귀·일반 디버깅 중 신호를 확인하세요. 자동 관찰의 상태·표본 수는 `window.webguard.getDebuggingState()`로 읽을 수 있습니다.

창 크기 신호는 창 장식·확대·레이아웃으로 오탐할 수 있습니다. 실행 지연도 중단점·CPU 부하·브라우저 스케줄링을 구분하지 못하며, 일시 정지 중에는 SDK도 멈춥니다. 두 신호는 개발자도구 존재나 악성 사용의 확정 증거가 아닙니다. SDK는 `debugger` 구문이나 반복 정지 루프를 삽입하지 않습니다.

`onThreat`는 로컬 콜백이며 위 예제는 서버 전송을 하지 않습니다. 운영 수집을 추가한다면 이벤트 종류·시각·앱 릴리스 식별자처럼 진단에 필요한 항목만 보내고, 입력값·DOM 원문·인증 정보는 담지 마세요.

## 3. 운영: 보수적으로 적용

```js
window.webguard = WebGuardSDK.WebGuard.init({
  devtools: {
    detect: false,
    blockShortcuts: false,
    blockContextMenu: false,
    response: "monitor",
    shortcutScope: "non-editable",
  },
  debugging: { enabled: false, watch: false, response: "report" },
  domIntegrity: { enabled: false, response: "report" },
  integrity: { enabled: false },
});
```

이 정책은 오탐으로 사용자 조작을 막지 않는 출발점입니다. 관찰이 필요하면 스테이징에서 확인한 크기·지연 정책을 보고 모드로 적용합니다. 단축키·우클릭 제한은 제품 요구와 편집·접근성 검증을 마친 경우에만 각각 켜세요. `response: "monitor"`라도 `blockShortcuts`·`blockContextMenu`를 켜면 해당 입력 제한은 실행됩니다.

DOM 감시는 실제로 고정된 요소에만 별도로 적용하고 정상 렌더링·hydration·상태 갱신을 변조로 처리하지 않는지 먼저 확인합니다. `integrity.enabled: true`만으로 파일 검사가 자동 실행되지는 않으며, `checkIntegrity()`와 신뢰할 기준 해시를 별도로 연결해야 합니다. 런타임 파일 검사와 브라우저의 `<script integrity="…">` SRI 검증은 별개입니다.

## 수동 JSP·CDN의 환경 선택

개발·스테이징·운영용 초기화 파일을 따로 보관하고 **서버 배포 설정이나 서버 템플릿이 환경에 맞는 파일 하나를 선택**하게 구성합니다. 예를 들어 배포별 공통 JSP include가 해당 릴리스의 외부 `webguard-init.js` 경로를 출력하도록 합니다. 운영 파일에 개발용 초기화를 함께 넣거나 중복 초기화하지 마세요.

`?debug=1` 같은 쿼리, `localStorage`, 브라우저 전역 플래그로 운영 보호를 해제하는 우회 스위치를 만들지 않습니다. 운영 진단은 접근을 제한한 별도 환경이나 승인된 서버 배포 설정으로 수행합니다. 서버의 환경 선택도 클라이언트 코드를 신뢰 경계로 바꾸지는 않으므로 인증·권한·비밀값 검증은 서버에 유지합니다.

## 빌드 보호와 배포 검증

수동 CDN·JSP 런타임 연결에는 Node·npm이 필요하지 않습니다. **앱 JS 난독화까지 선택할 때만** 개발 PC·CI에서 Node 22.12 이상과 빌드 도구를 사용합니다. pnpm 11을 쓰면 Node 22.13 이상이 필요합니다. 운영 Java 서버에 Node를 추가하거나 매 요청에서 난독화하지 않습니다.

1. 기존 앱 테스트를 먼저 통과시킨 뒤 별도 릴리스 출력에 난독화를 적용합니다. 처음부터 가장 강한 프리셋을 선택하기보다 기능·크기·실행 비용을 확인합니다.
2. 운영과 같은 호스트에서 로그인·폼·IME·우클릭 편집·키보드 접근·페이지 이동·동적 import를 확인합니다. Next는 SSR·hydration·RSC 흐름도 확인합니다.
3. 최종 파일 바이트에 맞는 SRI와 HTTP 헤더를 적용하고 CSP·SRI 오류, 외부 API·폰트 차단 여부를 확인합니다. 기존 CSP·nonce 계약은 보존합니다.
4. 공개 소스맵·원본·비공개 보고서 경로의 접근 제한과 실제 배포 파일 바이트를 확인한 뒤 운영으로 승격합니다.

Vite의 생성 정책 파일도 운영 호스트에 실제 적용해야 합니다. Next 어댑터와 수동 SDK 연결은 CSP·SRI·HTTP 헤더를 자동 생성하지 않습니다. 기존 Next 서버 정책이나 [서버 템플릿](https://github.com/bonjin-app/webguard/blob/main/examples/server-templates/README.md)을 서비스에 맞춰 적용하세요. `.next` 전체에 정적 디렉터리 보호·진단을 실행하지 않습니다.

## 장애 진단과 복구

SDK·초기화 파일·앱 파일의 요청 상태와 실행 순서, CSP·SRI 오류를 먼저 확인합니다. 가드가 중복 실행되면 자동 통합과 수동 `init()`의 중복 여부를 확인하세요. 이벤트 해석과 개별 메서드는 [브라우저 API](API_BROWSER.ko.md)를 따릅니다.

진단용 원본·소스맵은 공개 자산과 분리한 접근 제한 저장소에 릴리스 식별자와 함께 보관합니다. 비공개 맵 경로만 지정했다고 맵이 자동 생성·보관된다고 가정하지 말고, 선택한 빌드 API의 수집 옵션과 실제 산출물을 확인하세요. 비공개 저장소에서만 오류 위치를 대조하며 `.map`이나 `sourcesContent`가 담긴 파일을 공개 경로에 복원하지 않습니다.

추정 신호로 문제가 생기면 `update()`로 해당 관찰을 끄거나 보고 모드로 되돌릴 수 있습니다. `destroy()`는 그 인스턴스가 소유한 런타임 리소스를 정리하지만 앱 난독화·서버 헤더·배포 파일을 되돌리지는 않습니다. 공유 자동 인스턴스의 수명은 앱 통합 수준에서 관리하세요.

릴리스마다 **SDK·외부 초기화 파일·앱 자산·HTML의 URL과 SRI·HTTP 정책**을 함께 기록합니다. 롤백도 검증한 이전 묶음으로 수행하고 캐시된 HTML이 새 파일과 섞이지 않는지 확인하세요. SDK만 교체하거나 SRI를 제거해 오류를 숨기지 않습니다. 복구 후 실제 URL에서 로딩·핵심 기능·헤더·최종 바이트를 다시 확인합니다.
