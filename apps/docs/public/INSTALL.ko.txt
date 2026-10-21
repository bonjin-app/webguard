# WebGuard 0.3.0 로컬 후보 검토·적용 가이드

완성도 점검: HTML은 UTF-8 선언을 CSP보다 앞에 유지합니다. 제공 서버는 실제 `about/index.html`이 있는 경우 `/about/`를 제공하고 `/about`은 쿼리를 유지해 이동시킵니다. 없는 페이지를 첫 화면으로 대체하지 않습니다. Vite preview의 명시적인 API 프록시 경로는 WebGuard의 정적 파일 필터·응답 정책을 거치지 않습니다. 좁은 API prefix를 지정하고, 해당 응답의 헤더·인증·비공개 자료 보호는 백엔드에서 처리하세요. `proxy.bypass`는 보호되지 않은 정적 파일 제공으로 빠질 수 있어 지원하지 않고 시작 시 오류를 표시합니다.

[설치 없이 체험](https://webguard.uulab.co.kr/demo) · [온라인 적용 안내](https://webguard.uulab.co.kr/docs/#install)

배포 패키지 이름은 **`uulab-webguard`**입니다. 저장소 내부의 `@webguard/*` 패키지를 따로 설치할 필요가 없습니다.

**현재 npm 공개 버전은 0.2.0이며, 0.3.0은 아직 게시하지 않은 로컬 후보입니다.** 아래 새 동작은 0.3.0 후보 기준입니다. npm의 0.2.0에 동일하게 제공된다고 판단하지 마세요. 게시와 별개로 로컬 검토를 진행합니다.

## 1. 설치

Node.js **22.12 이상**이 필요합니다. Vite 통합은 **Vite 7 또는 8의 ESM 웹 앱**에 적용합니다. Vite가 없는 환경은 범용 빌드 API·CLI를 사용합니다. 브라우저용 정적 산출물이 대상이며 SSR 서버 코드·라이브러리 빌드 자동 보호는 지원하지 않습니다.

검토된 0.3.0 로컬 패키지 파일을 전달받았다면 별도 시험 앱에서 설치할 수 있습니다. 아래 경로는 실제 파일의 절대 경로로 바꾸세요.

```sh
npm install -D /absolute/path/to/uulab-webguard-0.3.0.tgz
```

레지스트리 설치는 **0.3.0 게시 후**에만 사용합니다. 현재는 이 버전이 없어 실패합니다.

```sh
# 0.3.0 배포 후에만 실행
npm install -D uulab-webguard@0.3.0
```

게시 후 pnpm은 `pnpm add -D uulab-webguard@0.3.0`으로 설치합니다. SDK는 포함됩니다. Vite·범용 자동 통합은 앱에서 따로 초기화하지 않습니다. 수동 SDK는 명시적으로 시작합니다. 빌드 환경에는 개발 의존성도 설치되어 있어야 합니다.

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

[환경별 적용과 번들러 없는 HTML·JSP·PHP·ASP.NET 안내](ENVIRONMENTS.ko.md).

## 2. Vite 플러그인 하나로 적용

기존 `vite.config.ts`의 플러그인 목록에 `webguardApp()`을 추가합니다. React 플러그인 등 기존 설정은 유지하세요.

```ts
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";

export default defineConfig({
  plugins: [
    // react() 등 기존 플러그인,
    webguardApp(),
  ],
});
```

기본 프로덕션 빌드는 다음을 적용합니다.

- Strict/High 난독화와 RC4 문자열 인코딩
- 앱의 HTML 모듈 진입점보다 먼저 시작하는 브라우저 SDK
- 공개 소스맵 제거, SRI와 SHA-384 무결성 매니페스트
- 리소스보다 앞에 배치한 HTML CSP 메타 정책: `connect-src 'self'`, 지원 브라우저의 Trusted Types 강제 등
- 서버가 사용할 `webguard-headers.json`과 `_headers`

0.3.0에서는 호스트가 HTTP 헤더를 아직 반영하지 않아도 **HTML 메타로 지원되는 정책**이 문서에서 적용됩니다. 같은 출처 네트워크 요청만 기본 허용하고, 지원 브라우저에서는 `innerHTML` 같은 문자열 삽입을 제한합니다. **`frame-ancestors`와 report-only 정책은 실제 HTTP 응답 헤더가 필요합니다.** 메타 정책은 이를 대신하지 않습니다.

RC4 문자열은 브라우저의 복원 코드로 되돌릴 수 있습니다. 비밀값을 숨기는 암호화로 사용하지 마세요. 강한 난독화는 크기와 실행 비용을 늘릴 수 있습니다. Trusted Types 미지원 브라우저에서 문자열 DOM 삽입이 보호된다고 판단하면 안 됩니다.

```sh
npm run build && npx webguard-serve dist --port 4173
```

`http://127.0.0.1:4173`에서 확인합니다. `webguard-serve`는 생성된 HTTP 정책을 적용하고 소스맵·보고서·서버 제어 파일 등 비공개 경로를 숨깁니다. 기본 실행은 루프백 검증 서버이며 HTTPS·로그인·운영 인프라를 제공하지 않습니다. 없는 경로는 404이고 SPA 히스토리 라우팅은 별도로 구성해야 합니다.

같은 플러그인은 `vite preview`에도 별도 설정 없이 생성 헤더와 비공개 파일 제한을 적용합니다. `headers: false`이면 이 자동 적용도 끕니다. `npm run dev`에는 보호가 적용되지 않아 개발/HMR을 유지합니다. 보호 결과는 프로덕션 빌드에서 시험하세요.

### 어떤 계층에서 무엇이 적용되나요?

| 계층             | 적용 조건과 실제 동작                                                             | 자동으로 해결하지 않는 것                             |
| ---------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 빌드 산출물      | 후보의 `webguardApp()` 프로덕션 빌드: 난독화·소스맵 제거·SRI·매니페스트           | 코드 완전 은닉, 모든 동적 요청의 무결성 보장          |
| HTML 문서        | 초기 CSP 메타: 스크립트·네트워크 출처, 지원 브라우저의 Trusted Types 강제         | `frame-ancestors`, report-only, 비공개 경로 접근 제한 |
| HTTP 서버·호스트 | 보호 서버·Vite preview 또는 호스트 설정: 실제 응답 정책과 비공개 파일 제한        | 로그인·가격 재계산·업무 권한 검증                     |
| 브라우저 SDK     | 자동 시작. 입력 제한은 기본 꺼짐이며 명시적으로 켜야 함. 창 크기 감지는 추정 신호 | 개발자도구 잠금, 서버 보안, CSP 자체의 구현           |
| 앱의 서버        | 개발자가 별도 구현: 가격·권한·입력 검증                                           | WebGuard가 대신 구현하거나 배포하지 않음              |

SDK의 `checkIntegrity()`는 명시적으로 허용하고 호출한 리소스를 검사합니다. 자동 SRI와 역할이 다르며 사이트 전체를 자동 검사하지 않습니다. Trusted Types 미지원은 미지원으로 기록하고 검증 성공 수에서 제외하세요.

### SDK 파일 무결성 검사의 요청 보호

미게시 후보의 `checkIntegrity()`는 명시적으로 켜고 호출한 공개 HTTP(S) 리소스만 검사합니다. 쿠키·HTTP 인증 정보·리퍼러를 보내지 않고, 리디렉션을 따라가지 않으며 캐시를 재사용하지 않도록 요청합니다. 상대 URL은 현재 페이지 주소를 기준으로 해석하며 HTML의 `base` 태그로 검사 대상이 바뀌지 않습니다. 자격 증명이 포함된 URL과 `data:`·`blob:`·`file:` 등은 검사하지 않습니다.

```ts
webguardApp({
  runtime: {
    integrity: {
      enabled: true,
      timeoutMs: 10_000,
      maxBytes: 16 * 1024 * 1024,
      maxConcurrent: 4,
    },
  },
});
```

Vite 외의 `protectApp()` runtime과 직접 초기화하는 `WebGuard.init()`에도 같은 `integrity` 옵션을 사용합니다.

| 옵션            | 기본값         | 허용 범위           |
| --------------- | -------------- | ------------------- |
| `timeoutMs`     | 10,000ms       | 1~120,000 정수      |
| `maxBytes`      | 16MiB          | 1~64MiB 정수 바이트 |
| `maxConcurrent` | 인스턴스당 4개 | 1~16 정수           |

시간 제한은 응답 대기·스트림 읽기·해시 완료를 함께 포함합니다. 타이머가 늦게 실행돼도 실제 경과 시간이 한도를 넘으면 성공으로 반환하지 않습니다. 브라우저의 이벤트 루프가 정지하면 즉시 중단을 보장하지 못하고 이미 제출한 네이티브 해시 계산도 취소할 수 없습니다. 결과를 무효화하는 기한이며 하드 실시간·CPU 샌드박스가 아닙니다.

크기 제한은 gzip 등의 압축 해제 후 실제로 읽은 바이트를 기준으로 합니다. `Content-Length`가 없거나 압축 전송 크기를 나타내더라도 스트림을 직접 제한합니다. 브라우저가 필요한 스트림 API를 지원하지 않으면 무제한 버퍼 읽기로 전환하지 않고 검사에 실패합니다. 동시에 너무 많은 검사를 요청하면 추가 네트워크 요청을 보내지 않습니다.

한도 초과·시간 초과·리디렉션·통신 실패는 `false`와 로컬 `integrity-error`로 구분합니다. 정상 응답을 읽었지만 해시가 다를 때만 `integrity-mismatch`입니다. 실패 이벤트에는 URL·쿠키·응답 본문을 포함하지 않습니다. 끄기·`destroy()`·검사 한도 변경은 진행 중인 요청을 취소하고 이전 결과를 폐기합니다.

**쿠키 로그인이나 HTTP 인증이 필요한 파일은 이 SDK 검사로 확인할 수 없습니다.** 공개 배포 자산에 사용하고, 신뢰할 수 있는 빌드에서 기대 해시를 전달하세요. 임의 URL을 받아 검사하는 서버 프록시나 SSRF 방어 기능이 아닙니다. 내부 설정과 `getOptions()` 스냅샷은 프로토타입 없는 데이터 객체를 사용합니다. 속성 존재 확인에는 `Object.hasOwn()`을 사용하세요.

## 3. 선택적으로 개발자 단축키·우클릭 제한 켜기

두 입력 제한은 기본값이 `false`입니다. 필요하면 같은 플러그인 설정에서 켭니다.

```ts
webguardApp({
  runtime: {
    devtools: { blockShortcuts: true, blockContextMenu: true },
  },
});
```

SDK가 시작된 뒤 페이지의 일반 영역에서 F12 또는 Ctrl+Shift+I/J/C, macOS Cmd+Option+I/J/C를 가로챕니다. 로딩 이전 입력은 제한하지 않습니다. 입력창·편집 영역·폼 컨트롤은 편집과 접근성을 위해 제외합니다. 지원되는 열린 Shadow DOM의 편집 필드도 제외합니다.

Mac Option 키나 키보드 배열이 문자값을 `Dead`·특수문자로 바꾸는 경우에는 `KeyboardEvent.code`의 `KeyI/J/C`도 확인합니다. 공개 데모와 문서 사이트는 페이지 보호·페이지 전체 검사 단축키·본문 우클릭 제한이 켜진 상태로 시작합니다. 창 크기 추정 감지는 기본 OFF이며 별도로 켤 수 있습니다. 시험 영역 밖에서도 SDK가 동작합니다. 각 페이지의 실제 보호 설정에서 스위치를 꺼서 비교하세요. 설정은 해당 페이지에서만 유지되며 새로고침하면 기본값으로 돌아갑니다. 합성 시험 버튼은 이벤트 취소만 검사하며 실제 개발자도구 창이 닫혔다는 증거가 아닙니다.

앱에서 새로고침·재빌드 없이 변경할 수도 있습니다.

```ts
import { getWebGuard } from "uulab-webguard/client";

getWebGuard()?.update({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
getWebGuard()?.update({
  devtools: { blockShortcuts: false, blockContextMenu: false },
});
```

새로고침하면 빌드 설정으로 돌아갑니다. 개발 서버·SSR·자동 SDK 시작 전에는 `getWebGuard()`가 `undefined`입니다. 이 기능은 **개발자도구 창을 잠그지 않습니다.** 브라우저 메뉴, 이미 열린 도구, 원격 디버깅과 브라우저 소유자의 콘솔 실행은 통제하지 못합니다. 전달된 HTML·CSS·JavaScript와 네트워크 요청은 관찰할 수 있습니다.

### 페이지 보호 모드: 입력 영역까지 검사 키를 제한하고 안내 화면 표시

다음은 **미게시 후보**에 추가된 옵션입니다. 기존 npm 0.2.0에는 없습니다. 검토한 새 로컬 패키지를 설치한 뒤 Vite 설정에서 적용하거나, 직접 초기화하는 SDK의 `devtools`에 같은 값을 넣으세요. 범용 `protectApp()`의 `runtime`에서도 동일한 옵션을 사용합니다.

```ts
webguardApp({
  runtime: {
    devtools: {
      detect: true,
      blockShortcuts: true,
      shortcutScope: "page",
      response: "block",
    },
  },
});
```

- `shortcutScope: "page"`는 입력·편집 영역까지 검사 단축키를 가로챕니다. 생략하거나 `"non-editable"`이면 기존 편집 영역 제외를 유지합니다. 일반 입력·복사·붙여넣기와 IME 조합 중인 입력은 유지합니다. 창의 capture 단계에서 관찰하지만, SDK보다 먼저 등록된 리스너나 브라우저가 페이지에 전달하지 않는 입력은 제어할 수 없습니다.
- `response: "block"`은 관측된 검사 단축키 또는 창 크기 추정 신호에 반응해 네이티브 모달로 뒤쪽 페이지 조작을 제한합니다. `detect`·`blockShortcuts`를 함께 명시해야 해당 신호를 사용합니다. 모드 진입 시 이미 존재하는 크기 차이도 검사하며 기본 기준은 160px입니다. 창 테두리·배율은 오탐을, 분리된 도구는 미탐을 만들 수 있습니다.
- **닫은 뒤 다시 확인**은 현재 크기를 다시 측정합니다. 추정 신호가 사라지거나 `update({devtools:{response:"monitor"}})` 또는 `destroy()`를 호출하면 안내를 제거합니다. SDK를 `<head>`에서 실행해 body가 아직 없으면 DOM 준비까지 표시를 기다립니다.
- 로컬 콜백의 `page-blocked`는 모달이 실제 열린 뒤에만 발생합니다. `page-unblocked`는 표시 해제, `page-block-unavailable`은 모달 미지원·표시 실패를 뜻합니다. `shortcut-unavailable`은 취소할 수 없었던 이벤트이며 차단 성공으로 계산하지 마세요.

이 모드는 **개발자도구를 강제로 닫지 않으며**, DOM·리소스 읽기·콘솔·백그라운드 코드나 네트워크 요청을 통제하지 않습니다. 브라우저 소유자가 안내를 제거하거나 SDK를 우회할 수 있으므로 인증·인가에 사용하지 마세요. [공개 체험](https://webguard.uulab.co.kr/demo#live-demo)에서는 이 모드가 기본 ON입니다. 스위치로 끄고 다시 켜며 비교할 수 있습니다. 창 크기 추정 감지는 모드와 독립적으로 선택합니다. 데모의 별도 종료 버튼은 체험 전용입니다.

### 이 사이트에 실제 적용한 설정

공개 데모와 문서는 아래 설정을 빌드에 연결하여 자동 SDK 인스턴스를 시작합니다. UI는 새 SDK를 추가 생성하지 않고 같은 인스턴스의 `update()`와 `getOptions()`를 사용합니다. 개발/HMR에서는 자동 레지스트리로 하나만 초기화합니다. 이 설정은 사이트 체험을 위한 명시적 선택이며 패키지의 기본값을 변경하지 않습니다.

```ts
webguardApp({
  preset: "strict",
  headers: false, // 이 사이트는 기존 서버 정책과 비공개 경로 제한을 따로 적용
  runtime: {
    devtools: {
      detect: false,
      blockShortcuts: true,
      blockContextMenu: true,
      response: "block",
      shortcutScope: "page",
    },
    integrity: { enabled: true },
    debugging: {
      enabled: true,
      watch: true,
      intervalMs: 1000,
      thresholdMs: 1500,
      response: "report",
    },
  },
});
```

`headers: false`는 이미 정책을 제공하는 이 사이트의 호스트 설정입니다. 새 앱에서는 필요 없이 복사하지 말고 기본 자동 정책을 사용하세요. 난독화·소스맵 제거·서버 응답 정책은 빌드·배포에서 적용되므로 라이브 SDK 스위치로 해제되지 않습니다. 파일 무결성 검사는 허용 후 검사 버튼 또는 직접 API 호출이 필요합니다.

이 사이트는 페이지 조작 제한과 실행 지연의 자동 관찰을 켜며, 실행 지연 반응은 기본 `report`입니다. 이는 사이트의 명시적인 체험 정책이며 소비자 SDK의 자동 관찰 기본값은 OFF입니다. 개발자도구 창 자체를 금지하거나 닫는 기능은 아닙니다. 실제 브라우저 메뉴로 열거나 분리된 개발자도구를 사용하는 경우를 자동 통제한다고 표시하지 않습니다. 창 크기 추정은 브라우저 테두리·확대·내장 브라우저에 오탐이 있어 기본 OFF입니다.

## 4. 외부 API와 Trusted Types 호환성 조정

### 빈 화면을 배포하기 전에 확인하세요

`webguardApp()`은 Trusted Types 강제 모드에서 앱 소스의 `innerHTML`·`outerHTML` 대입, `insertAdjacentHTML`, 식별 가능한 `document.write/writeln` 호출을 발견하면 빌드에 `WG_TRUSTED_TYPES_SINK` 경고와 상대 파일 위치를 표시합니다. TypeScript 변환 후 검사하며 의존성·가상 모듈은 제외합니다. 경고가 나와도 정책을 자동 완화하지 않습니다.

이는 실행 여부나 입력의 안전성을 증명하는 분석이 아닙니다. 별칭·동적 프로퍼티·해석하지 못하는 문법·다른 삽입 지점은 검사하지 못하며, 경고가 없다고 호환성이 보장되지 않습니다. 빌드 결과를 실제 브라우저에서 확인하세요. 특히 공식 Vite vanilla 원본 템플릿은 `innerHTML`을 사용하므로 기본 강제 모드에서 초기 렌더링이 차단됩니다. 안전한 DOM API로 바꾸거나 아래 관찰 모드를 명시적으로 선택해야 합니다.

공개 데모의 [내 프로젝트에 적용](https://webguard.uulab.co.kr/demo#setup)에서 DOM API 앱·React·vanilla 원본 템플릿과 F12·우클릭 설정을 고르면 해당 Vite 설정을 복사할 수 있습니다. 원본 vanilla 선택은 Trusted Types가 차단 대신 관찰 모드라는 점을 표시합니다. 설정 생성은 현재 데모 페이지의 정책을 바꾸지 않습니다.

외부 API는 필요한 **정확한 출처(origin)**만 추가하세요. URL 경로나 와일드카드 대신 스킴·호스트·필요한 포트를 지정합니다.

```ts
webguardApp({
  headers: {
    allowedOrigins: {
      connect: ["https://api.example.com"],
    },
    trustedTypes: "report-only",
  },
});
```

이 예시는 외부 API 한 곳을 허용하고 이 플러그인의 Trusted Types 강제를 해제해 호환성을 점검합니다. `report-only`의 관측 정책은 생성된 **HTTP 응답 헤더**를 호스트에 적용해야 동작합니다. HTML 메타는 report-only를 제공하지 않습니다. 나머지 CSP는 계속 적용됩니다. 원격 보고 서버는 자동으로 설정하거나 호출하지 않습니다.

- `trustedTypes: "enforce"`: 기본값. 지원 브라우저에서 Trusted Types를 강제합니다.
- `trustedTypes: "report-only"`: Trusted Types를 차단하지 않고 HTTP 헤더로 관측합니다.
- `trustedTypes: "off"`: Trusted Types 정책을 끕니다. 다른 CSP는 유지합니다.
- `headers: false`: 자동 CSP 메타·헤더 생성과 Vite preview 정책 처리를 끕니다. 기존 호스트 정책을 직접 적용·검증하세요.

Trusted Types는 HTML 정화기를 대신하지 않습니다. 문자열 DOM 삽입과 외부 위젯이 깨지면 필요한 정확한 출처, Trusted Types 모드와 위젯 코드를 점검하세요. 정책을 완화하기 전에 보호 전후 동작을 비교하세요. 기존 호스트의 더 엄격한 HTTP 정책은 메타나 report-only 설정으로 해제되지 않습니다.

기존 HTML CSP 메타나 출력 정책 파일과 충돌하면 덮어쓰지 않고 빌드가 실패합니다. 정책을 플러그인에서 관리할지, `headers: false`로 기존 호스트에서 관리할지 결정하고 중복 정책을 정리하세요.

`runtime: false`는 자동 SDK만 끄고 빌드 보호를 유지합니다. 성능을 비교하려면 `preset: "standard"`로 조정할 수 있습니다. `build.outDir`로 출력 위치를 지정하세요. 별도 Rollup/Rolldown `output.dir`·`output.file`이나 다중 출력으로 후처리 경로를 우회하는 설정은 지원하지 않습니다.

## 5. 운영 호스트에도 HTTP 정책과 비공개 경로 적용

HTML 메타가 있어도 정적 호스트·CDN의 서버 설정은 필요합니다. `frame-ancestors`, report-only, MIME 보호 같은 응답 헤더와 비공개 파일 접근 제한은 메타로 구현할 수 없습니다.

| 실행·호스팅 방식       | 적용 방법                                                                 |
| ---------------------- | ------------------------------------------------------------------------- |
| 로컬 보호 서버         | `npx webguard-serve dist --port 4173`                                     |
| Vite preview           | `vite preview` 실행 시 플러그인이 헤더·비공개 경로 제한 자동 적용         |
| 기존 Node 서버         | `/server` API로 보호 서버를 만들거나 생성된 JSON 정책과 경로 제한을 통합  |
| `_headers` 지원 호스트 | 생성 파일을 유지하고 해당 호스트의 헤더·비공개 경로 처리 규칙을 모두 설정 |
| Nginx·프록시·API       | 실제 응답 헤더와 비공개 경로 거부 규칙을 서버에서 구성                    |

Node 도구에서 보호 서버를 만들 수 있습니다. 브라우저 앱에 가져오지 마세요.

```js
import { createProtectedServer } from "uulab-webguard/server";

const server = await createProtectedServer("dist");
server.listen(4173, "127.0.0.1");
```

기존 서버에서 헤더만 통합한다면 다음처럼 읽습니다. 이것만으로 비공개 파일 접근이 차단되지는 않으므로 정적 파일 라우터도 제한해야 합니다.

```js
import { readFile } from "node:fs/promises";
const headers = JSON.parse(
  await readFile("dist/webguard-headers.json", "utf8"),
);
for (const [name, value] of Object.entries(headers)) {
  response.setHeader(name, value);
}
```

Nginx 설정 예시 일부입니다. 외부 리소스 허용 등 실제 앱의 생성 정책으로 조정하고 404 응답에도 적용하세요. 중복 CSP는 여러 정책을 동시에 강제하므로 무작정 추가하지 마세요.

```nginx
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
location ~ ^/(webguard-report\.json|webguard-headers\.json|_headers)$ { return 404; }
location ~* \.map$ { return 404; }
location ~ (^|/)\. { return 404; }
```

원본 소스·환경 파일·키·개인 소스맵·설정·잠금 파일을 공개 출력에 넣지 마세요. `webguard-report.json`에는 로컬 경로가 포함될 수 있습니다. `webguard-headers.json`과 `_headers`는 서버용 제어 파일입니다. `_headers` 파일이 존재한다는 사실만으로 적용 또는 비공개 처리가 보장되지는 않습니다. 공개 매니페스트의 해시는 신뢰할 수 있는 배포 경로와 함께 보호해야 합니다.

## 6. 배포 결과 자동 검사

실제 배포에 사용한 로컬 `dist`를 보관해 검사합니다. 원격 매니페스트를 신뢰 기준으로 대신 사용하지 않습니다.

```sh
npx --no-install webguard-check dist --url http://127.0.0.1:4173/
npx --no-install webguard-check dist --url https://YOUR-SITE.example/app/
```

로컬 파일·매니페스트를 검증하고 실제 HTML·자산 바이트, SHA-384, 생성 정책에 해당하는 응답 헤더, 404·소스맵·보고서·서버 제어 파일 노출을 확인합니다. 실패하면 JSON `errors`와 종료 코드 1을 반환합니다. 메타 정책이 있더라도 요구되는 HTTP 헤더가 누락되면 검사에 실패할 수 있습니다.

저수준 `verifyDeployment()`도 헤더 옵션의 유무와 관계없이 실제 배포 루트의 상태를 확인하고, 로컬 매니페스트에 `index.html`이 있으면 해당 루트 응답의 바이트까지 비교합니다. `/index.html` 파일이 정상이어도 `/`에서 다른 HTML을 반환하면 실패합니다.

리디렉션을 따라가지 않으므로 정식 HTTPS 주소와 정확한 하위 경로를 지정하세요. 요청별 제한 시간은 10초입니다. 없는 파일에 SPA 폴백으로 200을 반환하거나 CDN이 파일을 다시 축소·변환해 바이트를 바꾸면 실패합니다. `checked`는 HTTP 요청 횟수로 빌드마다 다릅니다.

```js
import { checkDeployment } from "uulab-webguard/verify";
const result = await checkDeployment("dist", "https://YOUR-SITE.example/");
if (!result.valid) process.exitCode = 1;
```

이 검사는 관측 시점의 지정 파일·헤더·경로를 확인합니다. 로그인·권한 우회·API 취약점·DDoS 검증을 대신하지 않습니다. 가격 재계산과 서버 권한 검증은 앱의 서버 책임이며 SDK가 자동으로 제공하지 않습니다. `headers: false` 등 생성 기능을 끈 빌드는 검사에 필요한 로컬 정책을 직접 준비해야 합니다.

### 예상된 차단 로그와 실제 앱 오류 구분

데모의 고정 삽입 시험은 CSP 위반·Trusted Types TypeError를, 가격 변조 시험은 HTTP 409를 의도적으로 발생시킵니다. 빨간 콘솔 로그 자체가 성공의 근거는 아닙니다. 보호 전 실행·정상 응답과 보호 후의 실제 정책 위반 또는 해시 불일치를 함께 확인하세요.

일반 앱 화면에서 생기는 CSP 위반은 필요한 API·위젯이 막힌 호환성 문제일 수 있습니다. 404·5xx·처리되지 않은 예외, 보호 전 기준 응답 실패를 예상된 차단으로 분류하지 마세요. 시험 결과가 `확인 불가`·`미지원`이면 성공으로 세지 않고 원인을 확인합니다. 로그를 숨기거나 지우는 방식으로 통과시키지 마세요.

## 7. 수동 SDK와 문제 해결

자동 SDK 없이 수동 초기화할 때만 `/browser`를 사용합니다. 자동 SDK와 중복 초기화하지 마세요.

```ts
import { WebGuard } from "uulab-webguard/browser";
const guard = WebGuard.init({ devtools: { blockShortcuts: true } });

// 필요한 시점에 이 페이지의 옵션을 즉시 바꿉니다.
guard.update({ devtools: { blockContextMenu: true } });
```

앱/화면 종료·기능 해제 시 `guard.destroy()`를 호출하세요. 이벤트 리스너와 진행 중인 명시적 파일 검사를 정리하며, 이후 `update()`로 다시 시작되지 않습니다. `getOptions()`는 내부 상태와 분리된 옵션 스냅샷을 반환합니다. 자동 통합을 쓰는 앱은 새 인스턴스 대신 `/client`의 `getWebGuard()`로 기존 SDK를 조회하세요.

수동 브라우저 SDK만 연결하면 빌드 난독화·SRI·CSP·HTTP 헤더가 자동 생성되지 않습니다. 이 기능과 자동 SDK 시작은 `webguardApp()` 또는 `protectAppDirectory()` 빌드 통합으로 적용합니다. `checkIntegrity(url, expected)`는 `integrity: { enabled: true }`로 허용한 뒤 직접 호출하며, 신뢰할 수 있는 배포에서 얻은 `sha384-…` 기준값이 필요합니다. 웹 데모는 이런 동작을 확인하는 체험 공간이며 운영 앱을 대신 보호하는 서비스가 아닙니다.

Vite 외 자동 통합의 SDK는 `WebGuardSDK.getAutoGuard()`로 조회합니다. 독립 파일 `uulab-webguard/browser.global.js`는 로드만으로 시작되지 않으며 외부 초기화 파일에서 `WebGuardSDK.WebGuard.init()`을 호출해야 합니다. [수동 연결·서버 템플릿 예제](../examples/server-templates/README.md)를 참고하세요.

서버용 정책 생성은 `createSecurityHeaders`를 `uulab-webguard/headers`에서 가져옵니다. 브라우저 코드에는 `/client`·`/browser`를 사용하며 루트 빌드 진입점과 `/server`·`/verify`를 넣지 마세요.

- 개발 모드에서 F12가 열리면: 빌드 결과에서 옵션과 SDK 시작 여부를 확인하세요.
- 외부 API가 실패하면: `headers.allowedOrigins.connect`의 정확한 출처를 확인하세요.
- DOM·위젯이 깨지면: CSP/Trusted Types 진단과 지원 브라우저에서의 실제 동작을 확인하세요.
- HTTP 헤더가 없거나 제어 파일이 노출되면: 보호 서버 또는 호스트 규칙을 적용하세요.
- 패키지 상태 확인: `npm view uulab-webguard@0.3.0 version --registry=https://registry.npmjs.org`

공개 소스는 MIT이며 난독화 엔진의 BSD-2-Clause 고지를 함께 제공합니다. 설치 패키지의 `LICENSE`와 `THIRD_PARTY_NOTICES.md`를 확인하세요.

## 8. React·Next.js와 JSP·Java·Python·PHP

Vite 브라우저 앱에는 `webguardApp()`을 유지합니다. SSR 서버 빌드에는 Vite 보호 플러그인을 넣지 않습니다. Next.js App Router는 전용 클라이언트 Webpack 연결을 사용합니다.

```js
// next.config.mjs — 미게시 후보
import { withWebGuard } from "uulab-webguard/next";
export default withWebGuard(
  { reactStrictMode: true },
  {
    preset: "strict",
    runtime: { devtools: { detect: false, blockShortcuts: true } },
  },
);
```

Next 16에서는 `next build --webpack`으로 빌드합니다. 서버/RSC/API와 개발 모드는 변환하지 않고 운영 브라우저 청크를 보호합니다. Next의 CSP·요청별 nonce·SRI·HTTP 정책을 자동 생성하지 않으므로 기존 정책과 hydration을 함께 검증하세요. Turbopack은 지원하지 않습니다.

JSP·Java·Python·PHP는 브라우저 자산만 별도로 빌드·보호한 뒤 외부 SDK·초기화 파일·앱 JS와 최종 SRI를 서버 템플릿에 연결합니다. 템플릿·서버 언어 자체와 인라인 스크립트를 자동 난독화하지 않습니다. 서버 공개 루트에는 허용 자산만 배치하고 정책·보고서·매니페스트·소스맵은 밖에 보관하세요.

[환경별 전체 적용법](ENVIRONMENTS.ko.md), [Next 실행 예제](../examples/next-ssr/README.md), [JSP 실행 예제](../examples/jsp-servlet/README.md), [Python·PHP 실행 예제](../examples/ssr-templates/README.md)를 참고하세요. 현재 미게시 로컬 후보에서 검증하며 npm 배포는 보류합니다.

## 9. 선택 기능: CSS 식별자와 런타임 신호

아래 기능은 **미게시 로컬 후보** 기준이며 모두 기본 OFF입니다. 기존 npm 0.2.0에 포함된 것으로 판단하지 마세요. [런타임 강화 체험](https://webguard.uulab.co.kr/demo#runtime-hardening)에서 보호 전후를 비교합니다.

### CSS Modules 클래스 이름

```ts
webguardApp({ domIdentifiers: true });
```

운영 빌드에서 CSS Modules의 클래스 이름을 `wg_…` 형태로 만들고, 컴파일러가 생성한 JS의 클래스 참조도 같은 이름을 사용하게 합니다. Next는 `withWebGuard(existingConfig, { domIdentifiers: true })`로 설정하며 SSR과 브라우저에 같은 매핑을 적용합니다. Next가 관리하는 생성 폰트 스타일의 이름과 메타데이터는 유지합니다. 임의의 HTML `id`·전역 CSS·`data-*`·폼 이름이나 DOM 구조를 숨기거나 변경하지 않습니다. `.module.css`처럼 컴파일러의 CSS Modules 경로에 들어가는 스타일에 한정합니다.

Vite는 PostCSS CSS Modules, Next는 지원되는 Webpack CSS Modules 연결을 사용합니다. Lightning CSS·기존 사용자 정의 클래스 이름 생성기와 충돌하면 오류를 확인하고 한 쪽을 선택하세요. 생성된 클래스 이름에 의존하는 외부 CSS·E2E 선택자는 영향을 받을 수 있으므로 안정적인 `data-*`나 명시적인 ID를 사용하고 실제 SSR hydration·스타일을 확인하세요. 클래스 이름이 불투명해져도 브라우저의 Elements·Styles·CSS 파일은 계속 보입니다.

### 자동 관찰 또는 수동 검사를 선택하는 실행 지연 신호

Vite는 빌드 설정의 `runtime` 한 곳에서 자동 관찰을 켭니다. SDK가 시작된 뒤 보이는 페이지에서 관찰하며 별도 검사 버튼 호출이 필요하지 않습니다.

```ts
webguardApp({
  runtime: {
    debugging: {
      enabled: true,
      watch: true,
      intervalMs: 1000,
      thresholdMs: 1500,
      response: "report",
    },
  },
});
```

Next Webpack 연결에도 같은 브라우저 정책을 전달할 수 있습니다.

```js
withWebGuard(existingNextConfig, {
  runtime: {
    debugging: {
      enabled: true,
      watch: true,
      intervalMs: 1000,
      thresholdMs: 1500,
      response: "report",
    },
  },
});
```

`enabled`와 `watch`를 모두 켜야 자동 관찰합니다. `watch`는 기본 false이며 `intervalMs`는 기본 1,000ms, 허용 범위 250~60,000ms입니다. 관찰 타이머 하나가 지정한 전체 간격의 지연을 확인하고 다음 기한을 이어 잡습니다. 0ms 반복 루프나 `debugger` 트랩을 삽입하지 않습니다. 실제 복귀가 요청 간격에 더해 `thresholdMs` 이상 늦으면 `execution-pause-suspected` 신호를 냅니다. 연속으로 늦는 콜백은 정상 표본이 나오거나 관찰이 다시 시작될 때까지 중복 알림을 억제합니다.

탭이 숨겨지거나 `pagehide`가 발생하면 기한을 취소하고, 다시 보이거나 `pageshow`가 발생하면 새 기한으로 시작합니다. 숨겨진 시간을 실행 지연으로 점수화하지 않습니다. JavaScript가 일시 정지된 동안에는 SDK도 실행되지 않으므로 신호는 **실행을 재개한 뒤**에만 나올 수 있습니다. 개발자도구를 열기만 하고 실행을 멈추지 않으면 관찰할 변화가 없을 수 있습니다. CPU 부하·브라우저 스케줄링도 지연을 만들므로 이 신호가 DevTools 열림을 증명하지 않습니다.

기존 인스턴스에서 관찰 상태를 확인하거나 정책을 즉시 바꿀 수 있습니다.

```ts
import { getWebGuard } from "uulab-webguard/client";

const guard = getWebGuard();
const status = guard?.getDebuggingState();
// state: off | manual | watching | suspended | unavailable
// samples, lastCheckedAt, lastDelayMs, lastSuspicionAt
guard?.update({ debugging: { watch: false } });
```

상태는 관찰 OFF(`off`), 수동 검사만 허용(`manual`), 관찰 중(`watching`), 페이지 숨김·이탈로 대기(`suspended`), 환경 미지원(`unavailable`)을 구분합니다. `samples`와 마지막 시간·추가 지연 값은 **자동 관찰 표본만** 기록하며 아직 표본·신호가 없으면 시간·지연 값은 null입니다. 수동 검사 결과는 이 통계에 합산하지 않습니다. 관찰의 활성화·watch·간격·임계값·반응 정책이 바뀌면 통계를 초기화합니다. getter는 현재 스냅샷이며 자동으로 갱신되는 UI나 보안 판정값이 아닙니다.

자동 관찰 없이 필요한 시점에만 표본 하나를 검사하는 수동 경로도 유지합니다.

자동 통합한 SDK는 기존 인스턴스를 조회해서 설정합니다. 아래 코드는 브라우저에서 실행하세요.

```ts
import { getWebGuard } from "uulab-webguard/client";

const guard = getWebGuard();
guard?.update({
  debugging: {
    enabled: true,
    watch: false,
    response: "report",
    sampleMs: 100,
    thresholdMs: 1500,
  },
});
const delayed = await guard?.checkDebugging();
```

`checkDebugging()`은 호출할 때 보이는 페이지에서 타이머 표본 하나를 검사합니다. 요청 지연 `sampleMs`에 더해 실제 복귀가 `thresholdMs` 이상 늦으면 `true`와 실행 지연 의심 이벤트를 반환합니다. `false`에는 신호 없음 외에 비활성화·취소·숨겨진 페이지도 포함됩니다. 자동 관찰과 별도로 수동 표본은 한 번에 하나만 실행합니다. `watch: false`만으로 수동 검사까지 비활성화되지는 않으며 전체 검사를 해제하려면 `enabled: false`로 설정하세요.

수동 검사의 `sampleMs`는 기본 100ms·최대 1,000ms입니다. 공통 `thresholdMs`는 기본 1,500ms·최대 60,000ms입니다. 기본 반응은 `report`이며 임계값을 지나치게 낮추면 정상 사용도 의심 신호가 될 수 있습니다. 명시적으로 선택한 `response: "block"`은 의심 시 페이지 안내로 상호작용을 제한하며 개발자도구·콘솔·네트워크나 실행 중인 코드를 중단하지 않습니다.

### 선택한 정적 DOM의 변조 신호

```ts
// #static-notice가 실제로 마운트된 뒤 실행합니다.
guard?.update({
  domIntegrity: {
    enabled: true,
    selectors: ["#static-notice"],
    response: "report",
    maxNodes: 1000,
    maxBytes: 65536,
  },
});
guard?.rebaselineDom();
```

각 선택자의 **첫 번째 일치 요소**와 그 하위 정적 내용을 기준으로 속성·텍스트·이동·삭제·교체를 관찰합니다. 선택자는 최대 16개·각 256자이며, 전체 선택 영역의 합계 한도는 기본 1,000노드·65,536바이트, 최대 4,096노드·262,144바이트입니다. 전체 페이지를 자동으로 감시하거나 서버가 만든 마크업을 수정하지 않습니다. 이벤트에는 원시 DOM·텍스트를 담지 않고 신호 메타데이터만 제공합니다.

요소가 없거나 선택자·관찰·예산에 문제가 있으면 오류 신호를 내며 성공으로 판단하지 않습니다. 한 번 불일치·오류를 알리면 관찰을 멈추고, 명시적인 `rebaselineDom()`이 성공해야 새 기준으로 재개합니다. 이 메서드는 현재 내용을 새 기준으로 승인하므로 신뢰할 수 있는 앱 변경에만 호출하세요. 정상적인 직접 DOM 변경 직후에는 같은 동기 작업에서 다시 기준을 잡습니다. React처럼 나중에 커밋하는 경우 `setState()` 직후에 호출하지 말고, 실제 DOM 커밋 직후의 `useLayoutEffect` 등에서 동기적으로 처리해야 관찰 알림 전에 기준을 갱신할 수 있습니다. 카운터·폼·사용자 입력·실시간 목록은 정적 앵커로 지정하지 마세요.

SSR에서는 서버 요청 중 SDK를 실행하지 말고 hydration 이후에 켭니다. 예를 들어 React 클라이언트 컴포넌트의 정적인 공지에만 적용합니다.

```tsx
"use client";
import { useEffect } from "react";
import { getWebGuard } from "uulab-webguard/client";

export function StaticNotice() {
  useEffect(() => {
    const guard = getWebGuard();
    guard?.update({
      domIntegrity: {
        enabled: true,
        selectors: ["#static-notice"],
        response: "report",
      },
    });
    guard?.rebaselineDom();
    return () => guard?.update({ domIntegrity: { enabled: false } });
  }, []);
  return <p id="static-notice">계정 권한은 서버에서 검증합니다.</p>;
}
```

예제는 페이지가 공유하는 가드의 DOM 정책을 이 컴포넌트가 소유한다는 전제입니다. 여러 화면이 같은 정책을 관리한다면 앱 수명주기에 맞춰 한 곳에서 통합하세요. SDK가 마운트 후 시작되는 수동 통합은 가드 초기화가 완료된 뒤 설정해야 합니다.

두 신호 모두 직접 `WebGuard.init()`의 옵션이나 Vite·Next의 `runtime` 옵션으로 전달할 수 있습니다. DOM 감시를 초기 HTML 주입 단계에서 켜면 앱이 아직 마운트되지 않아 오류가 날 수 있으므로 위처럼 켜는 시점을 정하세요. 해제는 `guard.update({ debugging: { enabled: false }, domIntegrity: { enabled: false } })`, 완전한 정리는 `guard.destroy()`입니다. `block`은 관찰한 신호에 대한 클라이언트 UI 반응이며 인증·인가·서버 데이터 무결성을 대신하지 않습니다.

자동 관찰을 한 번 활성화한 뒤 OFF로 바꾸면 타이머와 visibility 수신기는 제거하고, `pagehide`·`pageshow` 수신기 두 개만 `destroy()`까지 유지합니다. OFF 동안의 페이지 복귀도 추적해 잘못 재시작하거나 계속 중지되는 일을 막습니다. 최초부터 비활성 상태인 SDK에는 이 두 수신기도 연결하지 않습니다.
