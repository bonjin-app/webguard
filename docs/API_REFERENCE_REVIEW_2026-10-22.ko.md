# WebGuard 공개 API 명세 보강 검증

기능 함수 명세를 보고 설치·사용할 수 있도록 실제 공개 패키지 계약을 한국어 문서로 작성했습니다. npm 게시와 전역 Codex 설정은 변경하지 않았습니다.

## 구현 범위

- [전체 API 색인](API.ko.md): 목적별 선택, 공개 import 경로 9개, 모든 함수·타입·메서드 연결.
- [브라우저 명세](API_BROWSER.ko.md): 초기화·자동 인스턴스·7개 인스턴스 메서드, 모든 런타임 옵션/기본값/범위, 이벤트, 반환값·실패·취소·수명 주기, React 예제.
- [빌드·검증 명세](API_BUILD.ko.md): 설정, 정적 앱 보호, 무결성, 헤더, 배포 검사, 로컬 서버의 서명·입력·결과·오류·예제.
- [연동·CLI 명세](API_INTEGRATIONS.ko.md): Vite·Next 옵션과 지원 범위, 실행 파일 3개와 명령·허용 옵션·종료 코드.
- 문서 홈·데모 설치 화면·설치/환경 가이드·README에서 연결. 정적 HTML과 원문 텍스트 제공. API 문서 4개를 다운로드 패키지에 동봉.
- TypeScript checker가 실제 package export map의 값·타입과 SDK 메서드를 수집합니다. 공개 경로 9개, export 노출 항목 58개(동일 이름 재노출 포함), 메서드 8개(init 포함), CLI 3개가 실제 명세 앵커로 연결되는지 `pnpm api:check`로 검사하며 빌드 시작에 적용합니다. 의미·예제의 정확성은 별도 소스 리뷰와 런타임 검사로 보완합니다.

## 소스 리뷰

브라우저 SDK, 빌드/헤더/검증/서버, Vite·Next·CLI 계약을 소스와 대조했습니다. 발견한 CLI `--output` 필수 표기를 선택으로 수정했습니다. 실제 생략 시 기본값은 `resolve(INPUT) + "-protected"`입니다. 브라우저 정책 예제는 실제 `blockShortcuts` 옵션을 사용합니다. 내부 연결 인수와 공개 export가 아닌 경로를 사용자 API로 소개하지 않습니다.

## 로컬 검증

소스 커밋: `3f802586b282944b29c7c832264601fff512a684`.

- 전체 단위·통합 검사: 47개 파일, 635개 테스트 통과.
- 최종 문서 수정 후 API/정적 가이드 검사 9개 재확인, 타입 검사·lint·Prettier·diff 검사 통과.
- 로컬 Chromium·Firefox·WebKit 가이드/다운로드 검사 36개 통과. 전체 7개 정적 가이드, JavaScript 비활성 상태, 390px 모바일 폭, 문서 간 앵커, 원문 텍스트와 다운로드 연결 포함.
- 최종 패키지 한 파일을 새 소비자에 설치: Vite 7·8, Webpack/esbuild/정적 HTML, Next Webpack, Python WSGI 세 엔진 검사 통과. PHP 실행 파일이 없어 해당 런타임은 제외했으며 새 Java 실행 증거를 주장하지 않습니다. [소비자 영수증](evidence/api-reference-2026-10-22/installations.json).
- 정규 npm 보류 tarball/record와 전역 Codex 설정의 해시 보존.

## 공개 배포

- 주소: [공개 API 명세](https://webguard.uulab.co.kr/docs/API.ko.html).
- Worker `webguard-demo`, 버전 `58be7569-77a6-472e-9d94-3e8e8077799e`, 트래픽 100%.
- 기존 ASSETS 바인딩·런타임 설정을 보존하고 `--keep-vars`로 배포했습니다.
- 공개 파일 68개가 로컬 배포 바이트와 일치합니다. 최종 패키지 내부 파일 38개도 현재 패키지 파일과 일치합니다. 소비자에 설치한 tarball과 공개 다운로드의 SHA-512가 같습니다.
- 다운로드 릴리스 `0.3.0-f200caff650d6cd5`, 이전 고정 릴리스 2개 유지. SDK CDN SRI·다운로드 동일성·전송 헤더 확인.
- 공개 전체 회귀 최초 실행: 327개 중 322개 통과, CDP 전용 2개 제외, 3개 실패. 실패는 세 엔진 모두 같은 기존 테스트가 `.setup-support a`를 하나로 가정한 엄격 선택자 오류였습니다. 환경 가이드의 정확한 href로 수정한 뒤 같은 공개 배포에서 설치 화면 전체 12개를 재실행해 모두 통과했습니다. 서로 다른 고유 검사는 총 325개 통과/2개 제외로 확인했고, 앱 산출물은 이 테스트 수정으로 바뀌지 않았습니다. [최초 결과](evidence/api-reference-2026-10-22/public-initial.log) · [수정 후 결과](evidence/api-reference-2026-10-22/public-setup-fixed.log).
- 실제 브라우저의 색인 → 함수 상세 이동 및 화면 캡처 확인. [배포·보존 검사](evidence/api-reference-2026-10-22/readback.json).

브라우저에 전달한 코드를 완전히 숨기거나 개발자도구 창을 닫는 기능을 주장하지 않습니다. 문서는 현재 소스/다운로드 후보 기준이며 npm 게시를 뜻하지 않습니다. 런타임 자동화 결과는 실제 기기나 모든 호스트·앱 조합의 인증이 아닙니다.
