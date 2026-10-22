# WebGuard API 명세

설치 후 호출하는 공개 함수·옵션·반환값·오류·이벤트를 실제 패키지 export 기준으로 정리했습니다. 서비스명은 WebGuard이며 import·설치에 사용하는 패키지 식별자는 `uulab-webguard`입니다. [설치](INSTALL.ko.md) → [환경별 적용](ENVIRONMENTS.ko.md) → 아래 함수 명세 순서로 확인하세요.

## 목적에 맞는 진입점

| 하고 싶은 일                        | 사용할 API                                     | 상세 명세                                                                                                               |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Vite 설정 한 번으로 난독화·SDK 연결 | `webguardApp`                                  | [Vite 앱 연동](API_INTEGRATIONS.ko.md#webguardapp)                                                                      |
| Next 프로덕션 브라우저 번들 보호    | `withWebGuard`                                 | [Next 연동](API_INTEGRATIONS.ko.md#withwebguard)                                                                        |
| 정적 빌드 출력 보호                 | `protectAppDirectory` / `webguard protect-app` | [Node](API_BUILD.ko.md#protectappdirectory) · [CLI](API_INTEGRATIONS.ko.md#webguard-cli)                                |
| 실행 중 가드 켜기·끄기              | `getWebGuard()?.update`                        | [옵션 갱신](API_BROWSER.ko.md#webguardinstanceupdate)                                                                   |
| 수동 SDK 시작·종료                  | `WebGuard.init` / `destroy`                    | [초기화](API_BROWSER.ko.md#webguardinit) · [종료](API_BROWSER.ko.md#webguardinstancedestroy)                            |
| 파일 변조·디버깅 신호 점검          | `checkIntegrity` / `checkDebugging`            | [무결성](API_BROWSER.ko.md#webguardinstancecheckintegrity) · [디버깅](API_BROWSER.ko.md#webguardinstancecheckdebugging) |
| 서버 헤더 생성                      | `createSecurityHeaders`                        | [옵션·결과](API_BUILD.ko.md#createsecurityheaders)                                                                      |
| 배포된 파일·헤더·비공개 경로 점검   | `checkDeployment` / `verifyDeployment`         | [출력 디렉터리 기준](API_BUILD.ko.md#checkdeployment) · [매니페스트 기준](API_BUILD.ko.md#verifydeployment)             |

## 공개 import 경로

| 경로                               | 공개 값                                                   | 타입·실행 환경                                                                                                     |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `uulab-webguard`                   | `webguardApp`, `webguard`                                 | Vite 설정용 Node. `WebGuardAppOptions`, `WebGuardConfigInput`, `Preset`, `ObfuscationLevel`, `StringArrayEncoding` |
| `uulab-webguard/client`            | `getWebGuard`                                             | 브라우저 자동 인스턴스 접근. 런타임 6개 타입                                                                       |
| `uulab-webguard/browser`           | `WebGuard`, `default`, `getAutoGuard`, `installAutoGuard` | 수동·자동 브라우저 SDK. 런타임 6개 타입                                                                            |
| `uulab-webguard/browser.global.js` | 전역 `WebGuardSDK`                                        | script/CDN용 IIFE. `WebGuard`, `default`, `getAutoGuard`, `installAutoGuard` 속성                                  |
| `uulab-webguard/build`             | 아래 빌드 함수 11개                                       | 빌드 도구용 Node API 및 11개 타입                                                                                  |
| `uulab-webguard/headers`           | `createSecurityHeaders`                                   | `SecurityHeadersOptions`, `TrustedTypesMode`                                                                       |
| `uulab-webguard/verify`            | `checkDeployment`                                         | `DeploymentCheck`                                                                                                  |
| `uulab-webguard/server`            | `createProtectedServer`                                   | 로컬 Node HTTP 서버                                                                                                |
| `uulab-webguard/next`              | `withWebGuard`                                            | `WebGuardNextOptions`. Next Webpack 설정용                                                                         |

브라우저 런타임 타입 6개는 `WebGuardOptions`, `WebGuardInstance`, `ThreatEvent`, `DebuggingPolicy`, `DebuggingState`, `DomIntegrityPolicy`입니다. Node 전용 빌드·서버 모듈을 브라우저 앱에 import하지 마세요. 배포된 `dist`에 선언 파일이 있더라도 export map에 없는 `/cli`, `/next-runtime` 같은 내부 경로는 공개 import API가 아닙니다.

## 브라우저 함수와 타입

| 이름                                                                                                      | 의미                            |
| --------------------------------------------------------------------------------------------------------- | ------------------------------- |
| [WebGuard](API_BROWSER.ko.md#webguard) · [default](API_BROWSER.ko.md#default)                             | 동일한 SDK 객체. 생성자 아님    |
| [WebGuard.init](API_BROWSER.ko.md#webguardinit)                                                           | 인스턴스 생성                   |
| [installAutoGuard](API_BROWSER.ko.md#installautoguard)                                                    | 브라우저 자동 인스턴스 설치     |
| [getAutoGuard](API_BROWSER.ko.md#getautoguard) · [getWebGuard](API_BROWSER.ko.md#getwebguard)             | 같은 자동 인스턴스 조회         |
| [update](API_BROWSER.ko.md#webguardinstanceupdate)                                                        | 실행 중 정책 갱신               |
| [getOptions](API_BROWSER.ko.md#webguardinstancegetoptions)                                                | 옵션 스냅샷                     |
| [checkIntegrity](API_BROWSER.ko.md#webguardinstancecheckintegrity)                                        | 공개 파일 해시 검증             |
| [checkDebugging](API_BROWSER.ko.md#webguardinstancecheckdebugging)                                        | 디버깅 신호 점검                |
| [getDebuggingState](API_BROWSER.ko.md#webguardinstancegetdebuggingstate)                                  | 최근 진단 상태                  |
| [rebaselineDom](API_BROWSER.ko.md#webguardinstancerebaselinedom)                                          | DOM 기준 갱신                   |
| [destroy](API_BROWSER.ko.md#webguardinstancedestroy)                                                      | 리스너·타이머·진행 중 검사 정리 |
| [WebGuardOptions](API_BROWSER.ko.md#webguardoptions)                                                      | 모든 런타임 옵션·기본값·범위    |
| [WebGuardInstance](API_BROWSER.ko.md#webguardinstance)                                                    | 7개 인스턴스 메서드             |
| [ThreatEvent](API_BROWSER.ko.md#threatevent)                                                              | 이벤트 종류·필드·콜백           |
| [DebuggingPolicy](API_BROWSER.ko.md#debuggingpolicy) · [DebuggingState](API_BROWSER.ko.md#debuggingstate) | 디버깅 정책·관측값              |
| [DomIntegrityPolicy](API_BROWSER.ko.md#domintegritypolicy)                                                | DOM 감시 정책                   |

## 빌드·검증 함수와 타입

다음 11개 함수는 `uulab-webguard/build`에서 가져옵니다.

| 함수                                                                         | 기능                           |
| ---------------------------------------------------------------------------- | ------------------------------ |
| [defineConfig](API_BUILD.ko.md#defineconfig)                                 | 타입 추론을 보존하는 설정 헬퍼 |
| [resolveConfig](API_BUILD.ko.md#resolveconfig)                               | 프리셋 병합·실제 설정 검증     |
| [protectAppDirectory](API_BUILD.ko.md#protectappdirectory)                   | 정적 앱 자동 보호·SDK 연결     |
| [protectDirectory](API_BUILD.ko.md#protectdirectory)                         | 정적 출력 보호                 |
| [scanDirectory](API_BUILD.ko.md#scandirectory)                               | 공개 파일 위험 검사            |
| [createDomIdentifierGenerator](API_BUILD.ko.md#createdomidentifiergenerator) | 일관된 CSS Modules 이름 생성   |
| [hashContent](API_BUILD.ko.md#hashcontent)                                   | SHA-384 SRI 해시               |
| [createManifest](API_BUILD.ko.md#createmanifest)                             | 파일 무결성 매니페스트 생성    |
| [verifyManifest](API_BUILD.ko.md#verifymanifest)                             | 로컬 매니페스트 비교           |
| [verifyDeployment](API_BUILD.ko.md#verifydeployment)                         | 실제 HTTP 배포 검사            |
| [createSecurityHeaders](API_BUILD.ko.md#createsecurityheaders)               | CSP·서버 헤더 생성             |

`/verify`의 [checkDeployment](API_BUILD.ko.md#checkdeployment)는 출력 디렉터리의 정책·매니페스트를 읽어 배포를 검사합니다. `/server`의 [createProtectedServer](API_BUILD.ko.md#createprotectedserver)는 로컬 점검용 Node 서버를 반환합니다.

공개 설정·결과 타입은 [WebGuardConfigInput](API_BUILD.ko.md#webguardconfiginput), [WebGuardConfig](API_BUILD.ko.md#webguardconfig), [Preset](API_BUILD.ko.md#preset), [SecurityHeadersOptions](API_BUILD.ko.md#securityheadersoptions), [TrustedTypesMode](API_BUILD.ko.md#trustedtypesmode), [DomIdentifierOptions](API_BUILD.ko.md#domidentifieroptions), [Finding](API_BUILD.ko.md#finding), [ProtectAppOptions](API_BUILD.ko.md#protectappoptions), [ProtectOptions](API_BUILD.ko.md#protectoptions), [ProtectionReport](API_BUILD.ko.md#protectionreport), [IntegrityManifest](API_BUILD.ko.md#integritymanifest), [DeploymentCheck](API_BUILD.ko.md#deploymentcheck)에 정리했습니다.

## 연동·명령행

Vite의 [webguardApp](API_INTEGRATIONS.ko.md#webguardapp)·[WebGuardAppOptions](API_INTEGRATIONS.ko.md#webguardappoptions), 저수준 [webguard](API_INTEGRATIONS.ko.md#webguard), Next의 [withWebGuard](API_INTEGRATIONS.ko.md#withwebguard)·[WebGuardNextOptions](API_INTEGRATIONS.ko.md#webguardnextoptions), [ObfuscationLevel](API_INTEGRATIONS.ko.md#obfuscationlevel)·[StringArrayEncoding](API_INTEGRATIONS.ko.md#stringarrayencoding)을 확인하세요.

실행 파일은 [webguard](API_INTEGRATIONS.ko.md#webguard-cli), [webguard-check](API_INTEGRATIONS.ko.md#webguard-check), [webguard-serve](API_INTEGRATIONS.ko.md#webguard-serve) 세 개입니다. 각 명령의 인수·허용 옵션·출력·종료 코드를 따로 명시했습니다.

## 기본값과 지원 범위

| 진입점                                          | 기본 프리셋           | SDK 자동 시작 | 디버깅 감지 기본           |
| ----------------------------------------------- | --------------------- | ------------- | -------------------------- |
| `webguardApp`                                   | strict                | 예            | 켜짐                       |
| `withWebGuard`                                  | strict                | 예            | 꺼짐                       |
| `protectAppDirectory` / `protect-app`           | strict                | 예            | 상세 옵션은 빌드 명세 참고 |
| `webguard`, `protectDirectory`, `resolveConfig` | standard              | 아니요        | 해당 없음                  |
| `WebGuard.init`                                 | 런타임 옵션 명세 참고 | 수동          | 명시적 정책에 따름         |

옵션 이름이 비슷해도 빌드 프리셋과 런타임 가드는 역할이 다릅니다. 난독화는 배포 전에 수행합니다. CDN SDK만 추가하면 기존 앱 소스까지 자동 난독화되지는 않습니다. 실행 중 `update`는 브라우저 정책만 바꾸며 이미 전달된 JS를 다시 변환하지 않습니다.

단축키 제한은 페이지에 전달되는 취소 가능한 입력에 적용됩니다. 브라우저 메뉴로 연 개발자도구 창을 강제로 닫거나, 콘솔 실행·Elements·전달된 자산을 완전히 숨기는 API는 없습니다. 디버깅 감지는 오탐·미탐 가능한 신호입니다. CSP·SRI·서버 헤더와 서버의 인증·인가·입력 검증을 함께 적용하세요. 보호 UI와 클라이언트 해시는 서버 보안 경계를 대체하지 않습니다.

## 문서와 버전 확인

이 문서는 현재 소스의 공개 API 계약입니다. npm 게시와 소스·다운로드 버전은 다를 수 있습니다. 설치한 `package.json` 버전과 동봉된 이 명세를 기준으로 사용하고, [다운로드](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 제공되는 버전을 확인하세요.

공개 export·SDK 메서드와 명세 앵커를 자동 대조합니다. 새 함수가 추가되면 명세 누락을 검증 오류로 처리합니다. 함수별 예제는 사용 흐름을 설명하며, 문서에 적힌 검사 범위를 넘어 모든 앱·브라우저의 실행 호환성을 보증하지 않습니다.
