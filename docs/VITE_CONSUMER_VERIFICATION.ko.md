# 새 Vite 프로젝트 설치 검증

2026-10-21 KST에 저장소 밖의 새 프로젝트에 **미게시 후보 `uulab-webguard@0.3.0` tgz**를 npm으로 설치해 검증했습니다. workspace 링크·소스 별칭·수동 SDK 초기화를 사용하지 않았습니다. npm 게시와 공개 데모 재배포는 수행하지 않았습니다. 확인 당시 npm `latest`는 `0.2.0`이고 `0.3.0`은 미게시입니다.

## 검증 결과

| 대상                                     | 설정                                                        | Chromium / Firefox / WebKit 결과                                 |
| ---------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| 독립 DOM API 앱, Vite 7.3.1              | `webguardApp()` 및 선택적 런타임 제한 설정                  | 15개 비교·변조 검사 통과                                         |
| 독립 DOM API 앱, Vite 8.3.4              | 동일                                                        | 15개 비교·변조 검사 통과                                         |
| 공식 create-vite 9.3.1 React, Vite 8.3.4 | 기존 `react()`에 `webguardApp()` 추가                       | 3개 브라우저 정상 동작, 페이지 오류 0                            |
| 공식 vanilla 원본                        | `webguardApp()`                                             | 3개 브라우저 모두 `innerHTML`이 기본 Trusted Types 정책에 차단됨 |
| 공식 vanilla 원본                        | `webguardApp({ headers: { trustedTypes: 'report-only' } })` | 3개 브라우저 정상 동작, 페이지 오류 0                            |

브라우저 버전은 Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2입니다. 세 브라우저 모두 이번 실행에서 Trusted Types 지원을 확인했습니다. 다른 버전의 지원 여부를 엔진 이름만으로 가정하지 않습니다.

독립 앱에서는 보호 전 빌드, HTTP CSP 헤더 없는 일반 정적 호스트의 기본 보호 빌드, 단축키 제한을 설정한 빌드, 보호 헤더를 적용하는 Vite preview를 비교했습니다. 각 브라우저에서 변조한 엔트리도 따로 검사했습니다.

- 실제 엔트리·지연 모듈 난독화 변환, 원본 문자열 미노출, 공개 소스맵 없음.
- HTML의 실제 SRI와 배포 파일 바이트 일치, 전체 manifest SHA-384 일치. 엔트리 응답 변조 시 실행 차단.
- 앱 모듈 실행 시 자동 SDK가 이미 존재. 카운터·지연 로딩·허용한 동일 출처 요청 정상 동작.
- 앱 이벤트 처리기에서 실행한 인라인 스크립트·eval·외부 fetch·문자열 HTML sink는 기본 보호에서 차단. 보호 전 비교 빌드에서는 실행됨.
- F12·Ctrl+Shift+I·Cmd+Option+J·우클릭은 설정과 실시간 전환에 따라 제한. 브라우저가 만든 실제 입력 이벤트로 확인했고, 입력창의 편집 동작은 유지.
- 명시적으로 활성화하고 호출한 SDK 파일 검사에서 일치·불일치 구분 및 이벤트 확인. 비활성화 뒤에는 요청을 보내지 않음.
- 설치한 패키지의 서버 API·`webguard-serve`·`webguard-check`와 Vite preview에서 실제 보안 헤더·비공개 경로 404 확인.
- 공개 export·TypeScript 타입·설치 파일 구성 확인. 프로젝트 전체 단위 테스트 287개와 타입·lint 검사 통과.

공식 템플릿 원본은 수정하지 않았습니다. vanilla의 기본 strict 실패는 정상 호환으로 계산하지 않았습니다. `report-only`는 Trusted Types 위반을 관찰하는 호환성 선택이며, 해당 HTML sink를 차단하는 설정과 동등하지 않습니다. 엄격한 기본 정책을 유지하려면 앱에서 `innerHTML` 대신 안전한 DOM API를 사용해야 합니다.

## 설정 한 번의 범위

React 프로젝트는 기존 플러그인에 다음 설정을 추가하면 됩니다.

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { webguardApp } from "uulab-webguard";

export default defineConfig({
  plugins: [react(), webguardApp()],
});
```

F12·우클릭 제한까지 처음부터 활성화하려면 같은 호출의 옵션으로 지정합니다. 수동 `WebGuard.init()`은 필요하지 않습니다.

```js
webguardApp({
  runtime: {
    devtools: { blockShortcuts: true, blockContextMenu: true },
  },
});
```

원본 vanilla 템플릿 등 문자열 HTML sink를 계속 사용하는 앱에서는 다음 호환성 옵션을 같은 호출에 추가할 수 있습니다. 다른 CSP 제한·난독화·SRI는 유지됩니다.

```js
webguardApp({
  headers: { trustedTypes: "report-only" },
  runtime: {
    devtools: { blockShortcuts: true, blockContextMenu: true },
  },
});
```

Vite 개발 서버의 HMR에는 보호를 적용하지 않습니다. `npm run build` 이후 `npm run preview` 또는 설치된 `webguard-serve`로 확인해야 합니다. 일반 정적 호스트에는 HTML meta CSP가 적용되지만, `frame-ancestors`·report-only 같은 HTTP 전용 정책과 비공개 경로 필터링은 실제 호스트에 설정해야 합니다. `webguard-serve`와 Vite preview에서는 이 설정을 자동으로 읽습니다.

단축키 제한은 브라우저 메뉴로 여는 개발자 도구까지 잠그지 않습니다. 난독화된 JavaScript 등 실행에 필요한 리소스는 브라우저에 전달됩니다. 데모의 가격·권한 서버 검증과 임의 코드 실행용 격리 체험기는 Vite 플러그인이 앱에 자동 생성하는 기능이 아닙니다.

## 재현

저장소에서 다음을 실행하면 npm에 게시하지 않고 새 tgz와 새 외부 프로젝트로 재검증합니다. `--keep`은 검증 프로젝트를 삭제하지 않고 보존합니다.

```sh
pnpm build
node scripts/release-npm.mjs prepare
node scripts/verify-npm-consumer.mjs --prepared --vite 8.3.4 --keep --evidence docs/evidence/installed-consumer-vite8.json
node scripts/verify-npm-consumer.mjs --prepared --vite 7.3.1 --keep --evidence docs/evidence/installed-consumer-vite7.json
node scripts/verify-vite-starters.mjs
```

각 receipt에 남긴 `project` / `directory` 경로에서 실제 소스·Vite 설정·설치 lockfile·빌드 산출물을 확인할 수 있습니다. 임시 디렉터리이므로 OS가 나중에 정리할 수 있습니다. 현재 후보 파일은 저장소의 `.npm-release/uulab-webguard-0.3.0.tgz`이며, 검사한 SHA-512는 아래 요약 receipt에 고정했습니다. npm에서 바로 설치할 수 있는 최신 버전과 혼동하지 마세요.

- [검증 요약과 후보 해시](evidence/vite-consumer-summary.json)
- [Vite 8 독립 소비자](evidence/installed-consumer-vite8.json)
- [Vite 7 독립 소비자](evidence/installed-consumer-vite7.json)
- [공식 템플릿 결과 및 보존 경로](evidence/vite-starters.json)
- [설치·적용 가이드](INSTALL.ko.md)
