# 공개 데모 자체의 난독화

입력 예제를 변환하는 기능과 별개로, 공개 데모를 구성하는 실제 JavaScript도 빌드 시 난독화합니다.

| 배포 코드                                                | 정책                      | 설정                                         |
| -------------------------------------------------------- | ------------------------- | -------------------------------------------- |
| 메인 데모 앱과 포함된 SDK                                | Strict / High             | `apps/playground/vite.config.ts`의 `plugins` |
| 변환 Web Worker                                          | Strict / High             | 같은 파일의 `worker.plugins`                 |
| Worker가 지연 로드하는 외부 `javascript-obfuscator` 엔진 | Standard                  | `index.browser-*.js` 청크 전용 정책          |
| 문서 앱                                                  | Strict / High             | `apps/docs/vite.config.ts`                   |
| React·JavaScript·TypeScript 예제 앱                      | 기존 `webguardApp()` 정책 | 각 예제의 Vite 설정                          |

Vite는 프로덕션 Worker를 별도로 빌드합니다. 따라서 메인 `plugins`만 설정하면 Worker에는 난독화가 적용되지 않습니다. 데모는 `worker.plugins`에서 매번 새 플러그인 인스턴스를 생성합니다. Worker가 참조하는 ESM 내보내기와 동적 import URL은 유지합니다. 자세한 설정 규칙은 [Vite 공식 Worker 문서](https://vite.dev/config/worker-options.html)를 참고하세요.

외부 엔진까지 High를 적용한 초기 측정에서는 해당 청크가 약 1.65MB에서 18.27MB로 늘었습니다. 공개 데모에서는 자체 코드의 Strict 정책을 유지하면서 외부 엔진에는 Standard를 적용합니다. 이는 전송 크기와 초기 실행 비용을 줄이기 위한 범위 구분입니다.

모든 앱은 공개 소스맵을 생성하지 않습니다. 배포는 준비된 정적 파일만 허용하며 `/src/main.ts`, `/package.json`, `/.env`, `/vite.config.ts`, `/webguard-report.json`과 소스맵 요청은 공개하지 않습니다. 배포된 JavaScript 파일의 해시는 준비한 산출물과 다시 비교합니다. 메인 문서의 SRI도 최종 변환된 바이트를 기준으로 생성됩니다.

`webguard-report.json`의 `chunkTransforms`는 메인 빌드의 변환 기록입니다. Worker의 별도 빌드 기록까지 포함하는 보고서가 아니며, 개별 `files[].transformed` 값만으로 Vite의 앞선 청크 변환 여부를 판정하면 안 됩니다. Worker 검증은 실제 ESM Worker·지연 import 실행 테스트와 세 브라우저의 공개 데모 테스트로 수행합니다.

브라우저가 실행하는 JavaScript와 CSS의 다운로드·열람 자체를 숨길 수는 없습니다. HTML과 CSS는 JavaScript 난독화 대상이 아닙니다. 난독화는 코드 분석 비용을 높이는 수단이며 서버 권한 검증을 대신하지 않습니다. npm 배포는 계속 보류합니다.
