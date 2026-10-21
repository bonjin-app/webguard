# esbuild + WebGuard

ESM·코드 분할·동적 import를 사용하는 실제 esbuild 예제입니다. Vite 없이 esbuild 결과를 범용 CLI로 보호합니다.

```sh
cd examples/esbuild
npm install
npm install -D /absolute/path/to/reviewed/uulab-webguard-0.3.0.tgz
npm run build
npm run preview
```

0.3.0은 미게시 후보이며 npm 게시를 보류합니다. SDK는 보호 결과에서 앱보다 먼저 시작합니다. 기본 입력 제한은 꺼져 있으며 CLI에 `--restrict-shortcuts --restrict-context-menu`를 추가하면 켭니다. Trusted Types는 이 예제에서 호환성 관찰 모드를 명시하며 실제 HTTP 헤더가 필요합니다.

원본 `dist`와 기존 목적지는 덮어쓰지 않습니다. 반복 검증에는 이전 결과를 보관하고 새 목적지를 선택하세요. 후처리 전 파일명의 해시는 최종 보호 바이트의 해시가 아닙니다. 배포별 경로 또는 재검증 캐시 정책과 최종 SRI/프리캐시 갱신이 필요합니다.
