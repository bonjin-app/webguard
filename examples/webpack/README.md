# Webpack + WebGuard

기존 Webpack 프로덕션 빌드 다음에 범용 보호 명령을 붙이는 예제입니다. Webpack 전용 플러그인이 아니며 Vite는 설치하지 않습니다. 소스맵이 있는 원본 빌드를 별도로 보존하고, 보호 결과의 소스맵 제거·SRI·SDK 시작·동적 청크 실행을 검증합니다.

```sh
cd examples/webpack
npm install
npm install -D /absolute/path/to/reviewed/uulab-webguard-0.3.0.tgz
npm run build
npm run preview
```

0.3.0은 미게시 후보이며 npm 배포는 보류 중입니다. 검토한 새 후보 파일을 설치해야 합니다. 출력 `dist-protected`가 이미 있으면 보호 명령은 실패합니다. 이전 결과를 보관하고 새로운 출력 경로를 선택하세요.

SDK 입력 제한은 기본 꺼짐입니다. 빌드 명령에 `--restrict-shortcuts --restrict-context-menu`를 명시하거나 브라우저에서 `WebGuardSDK.getAutoGuard().update({devtools:{blockShortcuts:true,blockContextMenu:true}})`로 켭니다. 입력 제한은 개발자도구 잠금 기능이 아닙니다.

동적 스크립트 로더의 호환성 확인을 위해 이 예제는 Trusted Types `report-only`를 명시합니다. 실제 HTTP 헤더가 필요하며, 문자열 DOM 삽입 자체는 차단하지 않습니다. 다른 CSP·난독화·SRI는 유지합니다. 보호 서버는 루프백 체험용입니다.

후처리는 기존 파일명을 유지합니다. Webpack의 `contenthash`는 보호 전 바이트의 이름이므로 보호 후 코드에 `immutable` 캐시를 그대로 적용하지 마세요. 배포별 경로 또는 재검증 캐시 정책을 사용하고 서비스 워커·프리캐시·외부 SRI를 최종 바이트와 맞추세요.
