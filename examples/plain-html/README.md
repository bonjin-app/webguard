# HTML / jQuery + WebGuard

번들러 없이 jQuery 4.0.0과 일반 외부 스크립트를 보호하는 예제입니다. Vite를 요구하지 않습니다.

```sh
cd examples/plain-html
npm install
npm install -D /absolute/path/to/reviewed/uulab-webguard-0.3.0.tgz
npm run build
npm run preview
```

0.3.0은 미게시 후보이며 npm 배포는 보류합니다. jQuery도 로컬 파일로 복사해 변환하며 CDN에 요청하지 않습니다. 앱과 SDK의 최종 SRI가 생성되고 외부 SDK가 앱 실행 전에 시작합니다. 기본 입력 제한은 꺼져 있습니다. CLI의 `--restrict-shortcuts --restrict-context-menu`나 SDK `update()`로 명시적으로 켭니다.

jQuery DOM 동작의 호환성을 위해 Trusted Types 관찰 모드를 명시합니다. 이는 HTML 정화나 문자열 DOM 삽입 차단이 아니며 실제 HTTP 헤더가 필요합니다. 인라인 스크립트·이벤트·스타일은 외부화하세요. 목적지가 이미 있으면 덮어쓰지 않습니다. 파일명은 유지되므로 릴리스별 경로 또는 재검증 캐시 정책을 사용하세요.

JSP·PHP·ASP.NET 템플릿 자체는 난독화하지 않습니다. 해당 환경은 정적 자산을 보호하고 외부 SDK 태그와 서버 응답 헤더를 연동합니다. [서버 템플릿 레시피](../server-templates/README.md)는 실제 서버 실행과 구분해 제공합니다.
