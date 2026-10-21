# Vite 외 환경의 설치·실행 검증

구현 소스는 `ec2f66b`입니다. npm 게시 없이 별도 디렉터리에 포장한 0.3.0 후보를 빈 소비자 프로젝트에 설치했습니다. 기존 `.npm-release/release.json`과 기존 후보 tgz는 교체하지 않았습니다.

검증 후보: `.npm-release/multi-environment-final/uulab-webguard-0.3.0.tgz`

```text
sha512-8x1mOBzBOQ2RC8DwW3hCPBSboeiry5X9Gv/gjxWB94MX0fHzwD7u6cXXsPpSrPfYRTudrDPgBVi1kbjcIE3Dew==
```

소스 커밋 후 다시 포장한 파일이 먼저 설치·검증한 파일과 바이트 전체가 동일함을 확인했습니다. 이전 소비자 검사에 표시되는 `6035d7b`는 당시 작업 디렉터리의 기반 커밋이며 변경 중인 구현의 정확한 커밋이 아닙니다. 최종 소스와 패키지 동일성은 별도 영수증에 기록합니다.

| 실제 설치 환경        | 연결 경로                         | 확인한 결과                                                    |
| --------------------- | --------------------------------- | -------------------------------------------------------------- |
| Webpack 5.112.0       | 설치한 `webguard protect-app` CLI | 프로덕션 빌드, 지연 청크, 앱보다 먼저 SDK 시작, 계산 결과 유지 |
| esbuild 0.28.2        | 설치한 `uulab-webguard/build` API | ESM·코드 분할·동적 import, SDK 초기화, 계산 결과 유지          |
| HTML + jQuery 4.0.0   | 설치한 범용 CLI                   | 번들러 없는 로컬 jQuery·일반 스크립트 보호와 실행              |
| 클래식 `<script>` SDK | 설치한 `browser.global.js`        | 로드만으로 자동 시작하지 않음, 명시적 초기화 후 입력 제한      |
| 기존 Vite 8.3.4       | 설치한 `webguardApp()`            | 15개 브라우저·호스팅·변조 조합 회귀 검사                       |

앞의 네 환경은 Chromium·Firefox·WebKit에서 총 **12개 실행 조합**을 통과했습니다. Vite가 설치되지 않았음을 확인했고, Vite 없이 소비자 TypeScript 선언 검사도 통과했습니다. Webpack·esbuild·HTML/jQuery에서는 원본 디렉터리 보존, Strict 변환 기록, 공개 소스맵 제거, 최종 매니페스트, 실제 서버 정책·비공개 파일 제한, 변조된 앱 스크립트의 SRI 거부를 검사했습니다. 입력 제한 기본 꺼짐과 F12·Ctrl+Shift+I·Cmd+Option+I의 페이지 이벤트 취소, 우클릭 제한, 정책 해제를 확인했습니다. 이는 개발자도구 창 전체가 잠긴다는 증거가 아닙니다.

Webpack·esbuild·jQuery 예제는 Trusted Types 관찰 모드를 명시합니다. HTML 정화·문자열 DOM 삽입 차단을 주장하지 않습니다. 원본 파일명의 contenthash는 보호 전 바이트의 이름이므로 배포별 경로 또는 재검증 캐시 정책이 필요합니다.

단위·통합 테스트 **347개**, 공개 패키지 파일 검사 변경 후 관련 회귀 **33개**, 로컬 데모의 관련 세 브라우저 검사 **75개**가 통과했습니다. 경로·심볼릭 링크·기존 출력·자격 증명·자동 CSP 충돌·내부 난독화 우회 옵션과 실제 설치 CLI의 심볼릭 링크 실행도 검사했습니다.

첫 설치 검사에서 입력 관찰기가 단축키의 Control/Meta 보조키를 본키보다 먼저 기록하는 시험 오류가 발견되어 본키의 `event.code`를 기다리도록 수정했습니다. 기존 Vite 소비자 검사도 새 문서·진입점·공유 타입 선언 파일을 예상 목록에 추가했습니다. 두 초기 실패 로그는 보관했으며 SDK 문제로 단정하거나 숨기지 않았습니다.

JSP·PHP·ASP.NET·Nginx 예제는 연결 레시피이며 이번에 실제 서버에서 실행하지 않았습니다. Next.js·Nuxt·Angular의 네이티브 SSR·nonce·hydration·서비스 워커·서명 매니페스트 통합과 실제 물리 브라우저 검증은 포함하지 않습니다. npm 배포는 계속 보류합니다.

공개 배포 후 전체 검사 **194/194**가 재시도 없이 통과했고 배포 파일 **36/36**의 해시가 준비한 산출물과 일치했습니다. 서버 런타임 설정과 바인딩도 유지했습니다. [전체 영수증](evidence/multienvironment-deployment.json) · [공개 적용 메뉴](https://webguard.uulab.co.kr/demo?environments=ec2f66b#setup).
