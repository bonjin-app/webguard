# WebGuard 랜딩페이지 개선 검증

사용자가 선택한 밝은 파란색·넉넉한 여백과 SDK 중심 방향을 유지하며 제품 소개와 사용 흐름을 정리했습니다. npm 게시와 전역 Codex 설정은 변경하지 않았습니다.

## 구성

- `/`를 SDK 제품 랜딩으로 제공합니다. 기존 공개 도메인의 `/demo` 자동 리디렉션을 제거했습니다.
- `/demo`는 별도 HTML 엔트리로 실시간 체험을 먼저 보여줍니다. `/demo/`의 308 정규화, 쿼리 전달, 기존 기능 딥링크와 비공개 경로 거부는 유지했습니다. 직접 `/demo.html`을 열어도 같은 데모 화면을 표시합니다.
- 첫 화면은 SDK 설명·적용/체험 버튼·실제 Vite 설정 예시·기존 SDK 패키지 이미지를 함께 보여줍니다. 환경별 지원 범위와 API 문서를 연결했습니다.
- 홈페이지의 긴 실시간 도구는 기본 접힌 체험 영역으로 정리했습니다. 체험 버튼·기능 링크·기존 해시가 해당 도구와 탭을 열며 현재 설정과 결과를 초기화하지 않습니다.
- 설치·환경·API 자료 영역과 제품/개발자/프로젝트 푸터를 추가했습니다. 모바일 메뉴 정렬, 작은 폭의 코드 영역, 줄바꿈을 점검했습니다.
- 홈/데모 각각 canonical·og:url을 서버가 제공하는 HTML에 포함합니다. JavaScript 비활성 상태에서도 설치·환경별 적용·API 문서로 이동할 수 있습니다.

## 검증과 수정

- 빌드·배포 타입 검사·전체 TypeScript·lint·Prettier·diff 검사 통과.
- 단위·통합 검사 47개 파일, 635개 테스트 통과.
- 로컬 핵심 UI/SDK 회귀 183개 중 179개 통과, CDP 전용 2개 제외, Firefox 모바일 레이아웃 2개 실패. DOM 너비 측정으로 좁아진 체험 영역의 파일 검사 `pre`가 줄바꿈 없이 넘치는 것을 재현했습니다. 결과에 `pre-wrap`/`overflow-wrap:anywhere`를 적용한 뒤 Firefox 탐색·제품 검사 8개가 모두 통과했습니다. 전체 페이지의 가로 넘침을 숨기지 않았습니다.
- 초기 전환 과정에서 직접 숨겨진 제어를 조작하던 테스트 helper는 체험 버튼/해시를 사용하는 실제 탐색 흐름으로 갱신했습니다. 입력 취소·무결성·DOM·실행 지연 검사 자체를 완화하지 않았습니다.
- 공개 초기 검사 330개: 325개 통과, CDP 전용 2개 제외, 3개 실패. Firefox API 문서 앵커 1건은 CSS 완료 전에 클릭한 추적이 확인돼 스타일 준비 대기와 400ms CSS 지연 회귀 조건을 추가했습니다. 뷰포트 확인은 유지했고 공개 Firefox 대상 검사 1회가 통과했습니다.
- WebKit의 두 초기 실패는 HTML·CSS·엔트리·기존 CF beacon 200 이후 공유 JS 요청의 응답 관찰이 끝나지 않은 로딩 대기였습니다. status/time -1만으로 응답 바이트 부재나 HTTP/2 결함을 확정하지 않습니다. 같은 코드·같은 제한 시간으로 직렬 2회와 병렬 반복 10회는 모두 통과했습니다. 근본 원인 수정으로 주장하지 않으며, 실패를 감추기 위한 preload/SRI 제거나 timeout 증가를 하지 않았습니다. 초기 로그와 재검사 로그를 보존했습니다.
- 별도 소스/산출물 리뷰에서 자체 앱 Strict 변환, 생성된 facade의 역할, 두 HTML의 SRI, 실제 Worker 라우터의 200/308/404 및 비공개 경로를 점검했습니다. 최종 배포 바이트는 별도 공개 readback으로 확인했습니다.

- 최종 공개 전체 회귀 검사: Chromium·Firefox·WebKit 330개 중 328개 통과, CDP 전용 2개 제외, 실패 0개(4.4분). Firefox CSS 지연 조건을 포함했습니다. 초기 WebKit 로딩 지연은 재현되지 않았으나 근본 원인을 확정한 것은 아닙니다.

## 배포

소스 커밋 `be120aa`. Worker `webguard-demo`, 버전 `51eccbb7-a81d-4963-87f9-5df54515d7a8`, 트래픽 100%.

[공개 랜딩](https://webguard.uulab.co.kr/) · [전용 데모](https://webguard.uulab.co.kr/demo).

공개 파일 70개가 로컬 배포 산출물과 바이트 단위로 일치했습니다. `/`·`/demo`의 GET 본문과 HEAD 응답을 각 index/demo HTML과 대조했습니다. 기존 ASSETS 바인딩·Worker 런타임 설정을 보존했습니다.

다운로드 릴리스 `0.3.0-f200caff650d6cd5`와 이전 고정 릴리스 2개는 그대로입니다. 공개 패키지 38개 파일이 현재 패키지와 일치하며 npm 보류 tarball/record와 전역 설정의 해시도 같습니다. 이번 작업은 SDK 버전 변경이나 npm 게시가 아닙니다.

[배포·파일·설정 확인 기록](evidence/landing-2026-10-22/readback.json) · [Firefox 수정 후 검사](evidence/landing-2026-10-22/firefox-fixed.log).

[최종 공개 전체 검사](evidence/landing-2026-10-22/public-final.log) · [데스크톱](evidence/landing-2026-10-22/public-desktop.png) · [모바일](evidence/landing-2026-10-22/public-mobile.png) · [개발자 자료 영역](evidence/landing-2026-10-22/public-resources.png).
