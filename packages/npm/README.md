# uulab-webguard

Vite 웹 앱에 강한 난독화, 자동 브라우저 SDK 시작, SRI·무결성 매니페스트와 서버 헤더 파일을 적용합니다. Node.js 22.12 이상과 Vite 7/8을 지원하는 ESM 패키지입니다.

[데모 체험](https://webguard-demo.uulab.workers.dev) · [한국어 전체 가이드](INSTALL.ko.md) · [온라인 가이드](https://webguard-demo.uulab.workers.dev/docs/#install)

```sh
npm install --save-dev uulab-webguard@0.1.0
```

```ts
// vite.config.ts — 기존 플러그인·설정은 유지하세요.
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";

export default defineConfig({
  plugins: [
    webguardApp({
      runtime: {
        devtools: { blockShortcuts: true, blockContextMenu: true },
      },
    }),
  ],
});
```

SDK를 따로 설치하거나 앱에 초기화 코드를 넣을 필요가 없습니다. `webguardApp()`은 Strict/High가 기본값이며, F12·우클릭 가로채기는 위처럼 명시적으로 켭니다. `npm run dev`에는 적용되지 않고 빌드된 페이지에서 SDK 시작 후 동작합니다.

```sh
npm run build
node node_modules/uulab-webguard/examples/server.mjs dist --port 4173
```

`http://127.0.0.1:4173`에서 확인하세요. 포함된 예제 서버는 생성된 `webguard-headers.json`을 실제 응답에 적용합니다. 운영에서는 서버·CDN에 정책을 반영해야 합니다. `_headers` 지원 호스트는 생성 파일을 최종 출력에 유지하세요. 예제 서버는 루프백 전용이며 없는 경로는 404를 반환합니다.

실시간 전환은 앱 코드에서 가능합니다.

```ts
import { getWebGuard } from "uulab-webguard/client";
getWebGuard()?.update({ devtools: { blockShortcuts: false } });
```

- `uulab-webguard`: Vite `webguardApp()` / 빌드 전용 `webguard()`
- `uulab-webguard/client`: 자동 SDK 조회·실시간 변경
- `uulab-webguard/browser`: 수동 SDK 사용
- `uulab-webguard/headers`: 서버 정책 생성

Trusted Types와 CSP는 기존 DOM 삽입·외부 위젯에 영향을 줄 수 있습니다. 호환성 점검에는 `headers: { trustedTypes: "report-only" }`, 기존 호스트 정책 유지에는 `headers: false`를 사용하세요. 브라우저용 코드는 `/client`나 `/browser`를 가져오세요. 서버/빌드 도구인 루트 진입점을 앱 번들에 넣지 마세요.

브라우저에 전달된 소스는 관찰·수정할 수 있고 난독화는 분석 비용을 높입니다. 브라우저 메뉴·콘솔·이미 열린 개발자도구를 완전히 막지는 못합니다. 비밀키와 권한 검사는 서버에 두세요. 원격 수집·설치 스크립트·무한 디버거 루프를 추가하지 않습니다.

MIT · 난독화 엔진 javascript-obfuscator의 BSD-2-Clause 라이선스 고지 포함.
