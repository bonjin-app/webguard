# SDK 설치·문서 검증 개선

기존 SDK 적용 방식과 공개 데모를 유지하며 처음 설치하는 개발자의 경로를 보강했습니다. npm 게시는 보류하며 전역 Codex 설정과 고정 CDN 파일을 변경하지 않았습니다. 이번 작업은 설치 검증·문서·CI 변경으로, 공개 데모 재배포나 새 SDK 런타임 기능 추가가 아닙니다.

## 확인한 문제와 수정

- [첫 GitHub CI](https://github.com/bonjin-app/webguard/actions/runs/39721852552)는 기록용 JSON 두 파일의 포맷과 설치 검증의 오프라인 캐시 가정 때문에 실패했습니다. 빌드·타입·lint·기존 단위/통합 검사는 통과했지만 이후 E2E·소비자 검사는 실행되지 않았습니다.
- `test:package`는 빈 저장소에서 `ERR_PNPM_NO_OFFLINE_TARBALL`을 재현했습니다. `--prefer-offline`으로 캐시가 없는 의존성은 내려받도록 고쳤으며, `--isolated-store`로 매 실행 새 임시 저장소를 선택할 수 있습니다. CI는 이 모드를 명시적으로 사용하고 결과를 `test-results/consumers/internal-package.json`에 보관합니다.
- 원본 SDK 자동 시작·client 진입점·단축키 처리·CSP 헤더 검사는 그대로입니다. 검증 대상은 로컬 tarball로 고정한 내부 패키지이며, 공개 facade의 실제 설치·브라우저 검사는 별도 `test:consumers`가 담당합니다. 이 둘을 같은 증거로 취급하지 않습니다.
- 한국어·영어·일본어·중국어 README 모두 다운로드 파일을 앱의 프로젝트 루트에 옮기거나 실제 절대 경로로 설치해야 함을 설명합니다.
- `pnpm readme:check`를 추가하고 `pnpm verify`에 연결했습니다. 네 언어의 탐색·상대 링크·제목 구조·실행 예제 일치를 검사하고, ES module과 독립 SDK 예제를 실제 공개 패키지 소스 타입으로 검사합니다. 예제 코드는 실행하지 않습니다. 이 검사는 네트워크 링크 가용성·번역의 자연스러움·앱 실행 호환성을 보증하지 않습니다.

## 로컬 검증

- 캐시가 빈 내부 패키지 소비자에서 실제 설치·Vite 빌드·SDK/client 실행·단축키 처리·헤더 산출물 검사 통과.
- 잘못된 링크·누락된 번역 탐색/제목·다른 설치 코드·공통 문법 오류·공통 잘못된 옵션·공통 존재하지 않는 독립 SDK 함수에 대한 실패 조건을 확인한 뒤 문서 검사 8개 통과.
- `pnpm verify`: 빌드·README 검사·타입·lint·단위/통합 48개 파일 643개 테스트 통과.
- `pnpm format:check`와 `git diff --check` 통과.
- README 검사: 4개 언어, 상대 링크 132개, 코드 블록 52개, 원문의 JavaScript/TypeScript 예제 5개 타입 검사. 번역 예제는 실행 토큰을 원문과 대조합니다.

[로컬 검증 범위·파일 해시](evidence/onboarding-2026-10-22/local-verification.json) · [빈 저장소 소비자 결과](evidence/onboarding-2026-10-22/cold-package-consumer.json) · [GitHub CI 실행 기록](https://github.com/bonjin-app/webguard/actions/workflows/ci.yml)
