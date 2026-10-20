# WebGuard 설계

## 목표

별도 서비스 계정이나 자체 서버 없이 사용할 수 있는 TypeScript 기반 웹 코드 보호 도구를 만든다.
브라우저에 전달된 코드의 완전한 은닉은 보장하지 않는다.

## 구조

pnpm 모노레포로 구성한다.
shared: 공통 타입과 이벤트
core: 설정 검증과 프리셋
obfuscator: 빌드된 JavaScript 변환
integrity: 파일 해시와 매니페스트 검증
browser: 선택적 단축키 제한과 탐지 콜백
cli: init, build, protect, scan, verify, report
vite-plugin: 프로덕션 빌드 통합

## 빌드 보호

Standard를 기본 프리셋으로 사용한다.
TypeScript와 JSX는 JavaScript로 빌드한 뒤 변환한다.
공개 출력에서 소스맵과 sourceMappingURL을 제거한다.
비공개 소스맵은 공개 출력 디렉터리 밖에 보관한다.
원본 출력은 보존하고 별도 보호 결과물을 생성한다.
실패하면 불완전한 결과물을 성공으로 보고하지 않는다.
최종 변환이 끝난 파일을 기준으로 무결성 해시를 생성한다.

## 브라우저 SDK

단축키와 컨텍스트 메뉴 제한은 기본 비활성화한다.
탐지는 참고 신호이며 인증이나 권한 판단에 사용하지 않는다.
무한 debugger, 강제 새로고침, 브라우저 프리징을 구현하지 않는다.
외부 전송은 기본 비활성화한다.
destroy 호출 시 리스너와 내부 자원을 정리한다.

## 예제와 Playground

Vanilla JS, TypeScript, React+Vite, JSP 예제를 제공한다.
JSP 서버 소스는 난독화 대상에서 제외한다.
Playground는 입력 코드를 주 페이지와 격리해 실행한다.
코드 크기와 실행 결과를 비교하고 보안 점수는 만들지 않는다.

## 검증

설정, 제외 규칙, 변환, 소스맵 제거, 해시를 검증한다.
동적 import와 비동기 코드의 동작 보존을 확인한다.
Chromium, Firefox, WebKit 자동화 테스트를 수행한다.
브라우저 자동화 결과와 실제 기기 검증을 구분한다.
성능 수치는 실제 측정 후 기록한다.

## 진행 순서

공통 기반 → 빌드 보호 → 브라우저 SDK → 예제와 Playground
→ 호환성 검증과 배포 준비 순서로 진행한다.
npm 공개와 외부 배포는 별도 승인 후 진행한다.

## 실행 결정 (2026-10-20)

사용자가 설계 문서 작성 후 실제 코드·테스트·예제까지 계속 구현하도록 명시적으로 승인했다.
설정 파일은 변경하지 않는다. 빈 저장소에서 codex/webguard-foundation 브랜치를 사용한다.
상세 요구사항의 기준은 docs/reference/original-brief.ko.md다.
