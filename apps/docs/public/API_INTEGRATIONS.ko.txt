# WebGuard 연동 API와 CLI 명세

Vite·Next 빌드 설정과 명령행 도구의 공개 계약입니다. 기술 패키지명은 `uulab-webguard`, 서비스명은 WebGuard입니다. 설치·버전 선택은 [설치 가이드](INSTALL.ko.md), 환경별 배치는 [환경 가이드](ENVIRONMENTS.ko.md), 전체 함수는 [API 색인](API.ko.md)을 참고하세요.

## webguardApp

```ts
import { webguardApp } from "uulab-webguard";
// webguardApp(input?: WebGuardAppOptions): Plugin[]
```

Vite 프로덕션 애플리케이션을 위한 기본 진입점입니다. Strict 난독화, 자동 브라우저 SDK 시작, 공개 소스맵 제거, 최종 파일 무결성 매니페스트, HTML SRI/CSP 연결과 서버 헤더 파일 생성을 하나의 설정으로 연결합니다. 반환된 플러그인 배열을 Vite `plugins`에 넣습니다. 개발 서버/HMR에는 프로덕션 변환을 적용하지 않습니다.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";

export default defineConfig({
  plugins: [
    webguardApp({
      preset: "strict",
      runtime: { devtools: { blockShortcuts: true } },
    }),
  ],
});
```

`vite build`를 실행하고 생성된 `dist`를 배포합니다. 앱의 기존 플러그인과 함께 사용하세요. `runtime.onThreat` 같은 함수는 빌드 옵션으로 직렬화하지 않습니다. 브라우저에서 콜백을 연결합니다.

```ts
import { getWebGuard } from "uulab-webguard/client";

const guard = getWebGuard();
guard?.update({ onThreat: (event) => console.info(event.type) });
```

실패: 라이브러리 빌드, SSR 빌드, `write:false`, 충돌하는 출력 경로, 안전하지 않은 공개 파일, 지원하지 않는 CSS Modules 설정 등은 빌드를 중단합니다. 프레임워크·플러그인 조합의 모든 호환성을 보장하지 않으므로 실제 기능과 지연 로드까지 검증하세요. 난독화는 브라우저가 받은 코드를 비밀로 만들지 않습니다.

## WebGuardAppOptions

`WebGuardConfigInput`을 확장합니다. 빌드 공통 필드는 [빌드 설정 명세](API_BUILD.ko.md#webguardconfiginput)를 참고하세요.

| 필드             | 타입                                                     | 기본값         | 동작                                                |
| ---------------- | -------------------------------------------------------- | -------------- | --------------------------------------------------- |
| `preset`         | `Preset`                                                 | `"strict"`     | 이 래퍼의 빌드·런타임 프리셋                        |
| `runtime`        | `Omit<WebGuardOptions, "preset" \| "onThreat"> \| false` | `{}`           | 자동 SDK 부팅. `false`면 부팅 생략                  |
| `headers`        | `SecurityHeadersOptions \| false`                        | 기본 헤더 옵션 | CSP 및 헤더 산출물 생성. `false`면 생략             |
| `domIdentifiers` | `boolean`                                                | `false`        | CSS Modules 생성 클래스 이름을 불투명한 값으로 변환 |

Vite 자동 SDK의 `devtools.detect`는 기본 `true`입니다. 단축키·우클릭 제한은 명시적으로 켭니다. 감지와 대응의 정확한 계약은 [브라우저 옵션](API_BROWSER.ko.md#webguardoptions)을 확인하세요. `headers`는 [createSecurityHeaders](API_BUILD.ko.md#createsecurityheaders)와 같은 옵션을 받습니다. HTTP 전용 헤더는 생성된 설정을 호스팅 서버에 적용해야 효력이 있습니다.

`domIdentifiers`는 CSS Modules 전용입니다. HTML의 모든 ID·클래스·텍스트를 숨기지 않습니다. Lightning CSS, 비활성 CSS Modules, 사용자 지정 `generateScopedName`과의 충돌은 오류입니다. Trusted Types가 앱의 `innerHTML` 같은 문자열 DOM 삽입을 차단할 수 있으므로 호환성 경고를 확인하고 안전한 DOM API로 수정하거나 명시적으로 보고 전용 정책을 선택하세요.

## webguard

```ts
import { webguard } from "uulab-webguard";
// webguard(input?: WebGuardConfigInput): Plugin
```

난독화·무결성 빌드 단계만 조합하는 저수준 Vite 플러그인입니다. 기본 프리셋은 `"standard"`입니다. SDK 자동 시작과 헤더 생성이 필요한 앱은 `webguardApp`을 사용하세요. 프로덕션 번들 변환, 공개 소스맵 제거, 최종 산출물 검사·보고를 수행합니다. 지원하지 않는 출력 형태·공개 파일은 오류로 중단합니다. 내부 연결용 두 번째 인수는 사용자용 설정 API가 아닙니다.

```ts
import { defineConfig } from "vite";
import { webguard } from "uulab-webguard";
export default defineConfig({ plugins: [webguard({ preset: "strict" })] });
```

## withWebGuard

```ts
import { withWebGuard } from "uulab-webguard/next";
// withWebGuard<T extends object>(nextConfig: T, options?: WebGuardNextOptions)
```

해결된 Next 설정 객체를 받아 새 설정 객체를 반환합니다. 기존 설정과 동기 `webpack` 훅을 유지하면서 프로덕션 브라우저 Webpack 5 번들을 보호하고, 선택한 SDK를 브라우저 엔트리에 주입합니다. `productionBrowserSourceMaps:false`, 브라우저 `devtool:false`, 최종 내용 해시를 적용합니다.

```js
// next.config.mjs
import { withWebGuard } from "uulab-webguard/next";
export default withWebGuard({ reactStrictMode: true }, { preset: "strict" });
```

```sh
npx next build --webpack
```

프로덕션은 명시적인 `--webpack`이 필요합니다. Turbopack은 지원하지 않습니다. 설정 함수·Promise·배열을 직접 전달하지 마세요. 비동기 설정이 필요하면 비동기 Next 설정 함수 내부에서 설정을 해결한 뒤 `withWebGuard`를 호출합니다. 기존 `webpack` 훅 자체는 동기적으로 설정 객체를 반환해야 합니다.

브라우저 `static/*.js`를 변환합니다. 개발/HMR, 서버·Edge·API·RSC 코드는 변환하지 않으며, `public/` 복사 파일이나 HTML Flight 데이터까지 자동 난독화하지 않습니다. 공개 소스맵·백업·미리 압축된 코드와 늦게 생성된 미보호 청크는 오류입니다. Next는 이 연동만으로 CSP·SRI·HTTP 헤더가 생성되지 않습니다. 요청별 nonce와 서버 정책은 앱에서 관리하세요.

## WebGuardNextOptions

| 필드              | 타입                                                     | 기본값       | 동작                                                                                      |
| ----------------- | -------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `preset`          | `Preset`                                                 | `"strict"`   | 앱·SDK·분류 불명 청크의 보호 수준                                                         |
| `frameworkPreset` | `"standard" \| "inherit"`                                | `"standard"` | 순수 외부 라이브러리 청크는 기본적으로 Standard 이하로 제한. `inherit`은 지정 프리셋 유지 |
| `runtime`         | `Omit<WebGuardOptions, "preset" \| "onThreat"> \| false` | `{}`         | 자동 SDK, `false`면 생략                                                                  |
| `domIdentifiers`  | `boolean`                                                | `false`      | 서버·클라이언트의 지원되는 CSS Modules 이름 생성 연결                                     |

Next 자동 SDK의 `devtools.detect`는 기본 `false`입니다. 필요하면 `runtime.devtools.detect:true`로 켭니다. Vite 자동 연동과 기본값이 다릅니다. 런타임 콜백은 클라이언트에서 `getWebGuard()?.update(...)`로 지정하세요. `runtime` 안의 `preset`·`onThreat`, 알 수 없는 옵션, 잘못된 타입은 거부됩니다.

`domIdentifiers`는 지원되는 Next CSS Modules 로더가 필요합니다. 사용자 지정 `getLocalIdent`, Lightning CSS 등 지원하지 않는 구성은 오류입니다. `next/font` 전용 생성 이름은 글꼴 메타데이터 호환성을 위해 유지합니다. 프레임워크 청크까지 High 수준을 적용하면 빌드 시간·파일 크기·실행 비용이 증가할 수 있습니다.

## ObfuscationLevel

```ts
type ObfuscationLevel = "basic" | "standard" | "high";
```

난독화 엔진의 수준입니다. `"strict"`는 `Preset` 값이며 이 타입의 값이 아닙니다. Strict 프리셋은 High 난독화와 RC4 문자열 인코딩 등을 선택합니다. 실제 기본값·세부 구성은 [빌드 설정](API_BUILD.ko.md#webguardconfig)을 확인하세요.

## StringArrayEncoding

```ts
type StringArrayEncoding = "none" | "base64" | "rc4";
```

문자열 배열 인코딩 방식입니다. High 수준의 기본은 `rc4`, 다른 수준의 기본은 `none`입니다. 클라이언트에서 복호화하는 문자열을 암호·서버 비밀로 취급하지 마세요.

## webguard CLI

설치된 패키지의 `webguard` 실행 파일입니다. 입력 경로는 빌드가 끝난 정적 디렉터리입니다. JSP·PHP·Python 서버 소스 자체를 입력으로 지정하지 마세요. npm 패키지 설치 후 `npx webguard ...` 또는 프로젝트 스크립트에서 호출합니다.

| 명령                                           | 필수 인수                   | 결과·용도                                |
| ---------------------------------------------- | --------------------------- | ---------------------------------------- |
| `webguard protect-app INPUT [--output OUTPUT]` | 입력 디렉터리               | 정적 앱 보호, 자동 SDK·정책 연결         |
| `webguard protect INPUT [--output OUTPUT]`     | 입력 디렉터리               | 빌드 산출물 보호. SDK 자동 부팅 없음     |
| `webguard scan INPUT`                          | 입력 디렉터리               | 탐지 결과 JSON. error 등급이 있으면 실패 |
| `webguard verify INPUT`                        | 보호 출력 디렉터리          | 로컬 매니페스트 검증 JSON                |
| `webguard verify INPUT --base-url URL`         | 출력·공개 URL               | 로컬 검증과 배포 응답 검증 JSON          |
| `webguard report [INPUT]`                      | 선택, 기본 `dist-protected` | 저장된 보고서 원문 출력                  |
| `webguard headers`                             | 없음                        | 서버 보안 헤더 JSON 출력                 |

```sh
npx webguard protect-app dist --output dist-protected --preset strict --restrict-shortcuts
npx webguard scan dist-protected
npx webguard verify dist-protected
npx webguard verify dist-protected --base-url https://example.com/
npx webguard report dist-protected
npx webguard headers --trusted-types report-only
```

### CLI 옵션

| 옵션                      | 허용 명령                | 값·기본값                                                                      |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `--output`, `-o`          | `protect-app`, `protect` | 선택 출력 경로. 생략 시 `resolve(INPUT) + "-protected"`                        |
| `--preset`                | `protect-app`, `protect` | `basic`, `standard`, `strict`, `custom`. 앱 기본 strict, protect 기본 standard |
| `--public-base`           | `protect-app`, `protect` | 선택 공개 경로. 원본 경로를 임의로 추정해 다시 쓰지 않음                       |
| `--base-url`              | `verify`                 | 선택 배포 URL                                                                  |
| `--restrict-shortcuts`    | `protect-app`            | 기본 꺼짐, 페이지에 전달된 취소 가능 단축키 제한                               |
| `--restrict-context-menu` | `protect-app`            | 기본 꺼짐, 페이지 우클릭 제한                                                  |
| `--trusted-types`         | `protect-app`, `headers` | `enforce`, `report-only`, `off`. 헤더 기본 enforce                             |
| `--no-runtime`            | `protect-app`            | SDK 자동 시작 생략                                                             |
| `--no-headers`            | `protect-app`            | 헤더 생성 생략                                                                 |
| `--help`, `-h`            | 전체 또는 개별 명령      | 사용법 출력                                                                    |
| `--version`, `-v`         | 단독 실행                | 설치된 패키지 버전 출력                                                        |

명령마다 허용하는 옵션이 다릅니다. 중복·알 수 없는·해당 명령에서 무시될 옵션, 잘못된 값·위치 인수는 오류입니다. `--no-runtime`과 두 제한 옵션, `--no-headers`와 `--trusted-types`를 함께 쓰면 오류입니다. 도움말·버전 옵션을 다른 동작 옵션과 섞지 마세요. CLI에는 `--config` 파일 로딩 옵션이 없습니다. 세부 정책이 필요하면 [Node 빌드 API](API_BUILD.ko.md#protectappdirectory)를 사용하세요.

종료 코드 `0`은 해당 명령 성공, `1`은 인수·처리 오류 또는 검증 실패입니다. 오류는 표준 오류에 출력합니다. 보고서·검사 결과의 의미는 [ProtectionReport](API_BUILD.ko.md#protectionreport)와 [DeploymentCheck](API_BUILD.ko.md#deploymentcheck)를 참고하세요.

## webguard-check

```sh
npx webguard-check dist-protected --url https://example.com/
```

정확히 `DIRECTORY --url URL` 순서로 사용합니다. 패키지의 [checkDeployment](API_BUILD.ko.md#checkdeployment)를 실행하고 결과 JSON을 출력합니다. `--help`·`-h` 지원. 성공은 `0`, 잘못된 인수·예외·검증 실패는 `1`입니다. 임의 인수 순서나 `webguard verify`의 `--base-url`을 이 명령에 사용하지 마세요.

## webguard-serve

```sh
npx webguard-serve dist-protected --port 4173
```

보호 산출물과 생성된 헤더를 로컬에서 확인하는 서버입니다. 기본 포트 `4173`, 바인딩 주소 `127.0.0.1`이며 공개 운영 서버 배포 도구가 아닙니다. `--port`는 1~65535 정수, `--help`·`-h` 지원. 인수·시작 오류는 표준 오류와 종료 코드 `1`로 반환합니다. 서버 객체가 필요하면 [createProtectedServer](API_BUILD.ko.md#createprotectedserver)를 사용하세요.

## 환경별 선택과 검증

| 환경                      | 진입점                                | 자동 범위                                     | 별도 확인                                   |
| ------------------------- | ------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| Vite·React·Vue            | `webguardApp`                         | 프로덕션 브라우저 번들·SDK·정책 산출물        | 호스팅 HTTP 헤더, 전체 앱 동작              |
| Next Webpack              | `withWebGuard`                        | 프로덕션 브라우저 청크·SDK                    | SSR/RSC, 요청 nonce·CSP·헤더                |
| Webpack·esbuild·정적 HTML | `protect-app` / `protectAppDirectory` | 빌드 후 정적 JS·실행 가능한 인라인 script·SDK | 동적 스크립트 문자열·실제 배포              |
| JSP·Java·PHP·Python SSR   | 정적 자산 보호 + 브라우저 SDK         | 준비된 브라우저 JS                            | 동적으로 렌더된 script/nonce·서버 인증·권한 |
| CDN·직접 다운로드         | `WebGuardSDK.WebGuard.init`           | 선택한 브라우저 가드                          | 앱 코드 난독화는 별도 빌드 단계             |

정적 HTML의 실행 가능한 script 본문과 실제 JS 파일이 처리 대상입니다. 런타임에 문자열로 생성하는 모든 코드나 서버 템플릿 내부의 모든 언어를 재귀적으로 분석해 변환하지 않습니다. 변환 오류를 무시해 미보호 결과를 배포하지 말고, 지원 범위·보호 보고서와 브라우저 기능 검증을 함께 확인하세요.
