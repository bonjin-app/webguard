# WebGuard 0.3.0 로컬 후보 검토·적용 가이드

완성도 점검: HTML은 UTF-8 선언을 CSP보다 앞에 유지합니다. 제공 서버는 실제 `about/index.html`이 있는 경우 `/about/`를 제공하고 `/about`은 쿼리를 유지해 이동시킵니다. 없는 페이지를 첫 화면으로 대체하지 않습니다. Vite preview의 명시적인 API 프록시 경로는 WebGuard의 정적 파일 필터·응답 정책을 거치지 않습니다. 좁은 API prefix를 지정하고, 해당 응답의 헤더·인증·비공개 자료 보호는 백엔드에서 처리하세요. `proxy.bypass`는 보호되지 않은 정적 파일 제공으로 빠질 수 있어 지원하지 않고 시작 시 오류를 표시합니다.

[설치 없이 체험](https://webguard.uulab.co.kr/demo) · [온라인 적용 안내](https://webguard.uulab.co.kr/docs/#install)

배포 패키지 이름은 **`uulab-webguard`**입니다. 저장소 내부의 `@webguard/*` 패키지를 따로 설치할 필요가 없습니다.

**현재 npm 공개 버전은 0.2.0이며, 0.3.0은 아직 게시하지 않은 로컬 후보입니다.** 아래 새 동작은 0.3.0 후보 기준입니다. npm의 0.2.0에 동일하게 제공된다고 판단하지 마세요. 게시와 별개로 로컬 검토를 진행합니다.

## 1. 설치

Node.js **22.12 이상**, Vite **7 또는 8**, ESM 방식의 Vite 웹 앱이 필요합니다. React·JavaScript·TypeScript 앱에 적용할 수 있습니다. SSR·라이브러리 빌드는 지원하지 않습니다.

검토된 0.3.0 로컬 패키지 파일을 전달받았다면 별도 시험 앱에서 설치할 수 있습니다. 아래 경로는 실제 파일의 절대 경로로 바꾸세요.

```sh
npm install -D /absolute/path/to/uulab-webguard-0.3.0.tgz
```

레지스트리 설치는 **0.3.0 게시 후**에만 사용합니다. 현재는 이 버전이 없어 실패합니다.

```sh
# 0.3.0 배포 후에만 실행
npm install -D uulab-webguard@0.3.0
```

게시 후 pnpm은 `pnpm add -D uulab-webguard@0.3.0`으로 설치합니다. SDK는 포함되어 있으며 앱에서 따로 초기화하지 않습니다. 빌드 환경에는 개발 의존성도 설치되어 있어야 합니다.

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

Mac Option 키나 키보드 배열이 문자값을 `Dead`·특수문자로 바꾸는 경우에는 `KeyboardEvent.code`의 `KeyI/J/C`도 확인합니다. 데모는 처음에 제한이 꺼져 있습니다. 단축키 제한 스위치를 켠 뒤 본문 시험 영역을 클릭하고 조합 키를 누르세요. 합성 시험 버튼은 이벤트 취소만 검사하며 실제 개발자도구 창이 닫혔다는 증거가 아닙니다.

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

수동 브라우저 SDK만 연결하면 빌드 난독화·SRI·CSP·HTTP 헤더가 자동 생성되지 않습니다. 이 기능과 자동 SDK 시작은 `webguardApp()` 빌드 통합으로 적용합니다. `checkIntegrity(url, expected)`는 `integrity: { enabled: true }`로 허용한 뒤 직접 호출하며, 신뢰할 수 있는 배포에서 얻은 `sha384-…` 기준값이 필요합니다. 웹 데모는 이런 동작을 확인하는 체험 공간이며 운영 앱을 대신 보호하는 서비스가 아닙니다.

서버용 정책 생성은 `createSecurityHeaders`를 `uulab-webguard/headers`에서 가져옵니다. 브라우저 코드에는 `/client`·`/browser`를 사용하며 루트 빌드 진입점과 `/server`·`/verify`를 넣지 마세요.

- 개발 모드에서 F12가 열리면: 빌드 결과에서 옵션과 SDK 시작 여부를 확인하세요.
- 외부 API가 실패하면: `headers.allowedOrigins.connect`의 정확한 출처를 확인하세요.
- DOM·위젯이 깨지면: CSP/Trusted Types 진단과 지원 브라우저에서의 실제 동작을 확인하세요.
- HTTP 헤더가 없거나 제어 파일이 노출되면: 보호 서버 또는 호스트 규칙을 적용하세요.
- 패키지 상태 확인: `npm view uulab-webguard@0.3.0 version --registry=https://registry.npmjs.org`

공개 소스는 MIT이며 난독화 엔진의 BSD-2-Clause 고지를 함께 제공합니다. 설치 패키지의 `LICENSE`와 `THIRD_PARTY_NOTICES.md`를 확인하세요.
