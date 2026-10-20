# WebGuard 설치와 적용 가이드

[설치 없이 체험](https://webguard-demo.uulab.workers.dev) · [온라인 적용 안내](https://webguard-demo.uulab.workers.dev/docs/#install)

배포 패키지 이름은 **`uulab-webguard`**입니다. 저장소 내부의 `@webguard/*` 이름과 구분하세요. 다른 사람이 소유한 `@webguard/core`를 설치할 필요가 없습니다.

## 1. 설치

Node.js **22.12 이상**, Vite **7 또는 8**, ESM 방식의 Vite 웹 앱이 필요합니다. React·JavaScript·TypeScript 앱에 적용할 수 있습니다. SSR·라이브러리 빌드는 지원하지 않습니다.

```sh
npm install --save-dev uulab-webguard@0.1.0
```

pnpm을 사용한다면 `pnpm add -D uulab-webguard@0.1.0`으로 설치하세요. SDK를 따로 설치하거나 앱 시작 코드에서 초기화할 필요가 없습니다. 빌드 단계에는 개발 의존성도 설치되어 있어야 합니다.

## 2. Vite 설정 한 번

기존 `vite.config.ts`의 플러그인 목록에 `webguardApp()`을 추가합니다. React 플러그인 등 기존 설정은 유지하세요.

```ts
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";

export default defineConfig({
  plugins: [
    // react() 등 기존 플러그인,
    webguardApp({
      runtime: {
        devtools: {
          blockShortcuts: true,
          blockContextMenu: true,
        },
      },
    }),
  ],
});
```

이 설정으로 프로덕션 빌드에 Strict/High 난독화, RC4 문자열 인코딩, 자동 SDK 시작, 공개 소스맵 제거, SRI·무결성 매니페스트와 서버 헤더 파일 생성이 적용됩니다. 문자열 인코딩은 브라우저에서 복원되므로 비밀값을 숨기는 암호화 수단으로 사용하지 마세요. 강한 난독화는 파일 크기와 실행 비용이 커질 수 있습니다.

```sh
npm run build
node node_modules/uulab-webguard/examples/server.mjs dist --port 4173
```

`http://127.0.0.1:4173`에서 실제 빌드와 헤더를 확인합니다. 패키지에 포함된 예제 서버는 Node 내장 모듈만 사용하며 `webguard-headers.json`을 응답 헤더로 적용합니다. 루프백 전용 검증 서버이고 HTTPS·로그인·운영 서비스는 제공하지 않습니다. 존재하지 않는 경로는 404이며 SPA 히스토리 라우팅은 별도로 구성해야 합니다.

`npm run dev`에서는 개발/HMR을 방해하지 않도록 보호 플러그인이 실행되지 않습니다. 보호 여부는 반드시 빌드 결과로 확인하세요.

## 3. F12 제한은 언제 켜지나요?

위의 `blockShortcuts: true`는 **빌드된 페이지에서 SDK가 시작된 뒤** 적용됩니다. SDK는 HTML의 일반 모듈 앱 진입점보다 먼저 시작합니다. 자바스크립트 로딩 이전의 키 입력이나 기존 클래식 스크립트 실행 순서까지 바꾸지는 않습니다. 두 제한 옵션은 기본값이 `false`라 사용하려면 명시적으로 켜야 합니다.

페이지의 일반 영역을 클릭한 뒤 F12 또는 Ctrl+Shift+I/J/C, macOS Cmd+Option+I/J/C를 시험하세요. 입력창·편집 영역·포커스된 폼 컨트롤에서는 편집과 접근성을 위해 가로채지 않습니다. 우클릭 제한은 `blockContextMenu`로 별도 제어합니다.

새로고침이나 재빌드 없이 즉시 변경하려면 앱 코드에서 같은 패키지의 브라우저용 진입점을 사용하세요.

```ts
import { getWebGuard } from "uulab-webguard/client";

// 현재 페이지에서 바로 켜기
getWebGuard()?.update({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});

// 현재 페이지에서 바로 끄기
getWebGuard()?.update({
  devtools: { blockShortcuts: false, blockContextMenu: false },
});
```

새로고침하면 빌드 설정으로 돌아갑니다. 개발 서버·SSR·자동 SDK 시작 전에는 `getWebGuard()`가 `undefined`입니다. 영구 설정이 필요하면 앱에서 저장·복원 정책을 구현하세요. 브라우저 메뉴, 이미 열린 개발자도구, 원격 디버깅과 브라우저 소유자의 콘솔 실행까지 막을 수는 없습니다. 권한 검사는 서버에서 수행해야 합니다.

## 4. 서버 보안 헤더 적용

빌드는 `dist/webguard-headers.json`과 `dist/_headers`를 생성합니다. **Vite 설정만으로 운영 서버의 HTTP 헤더가 바뀌지는 않습니다.** 호스트가 이 파일을 반영해야 합니다.

| 호스팅 방식                 | 적용 방법                                                                  |
| --------------------------- | -------------------------------------------------------------------------- |
| 포함된 Node 예제            | 위의 `server.mjs dist` 명령으로 JSON 정책 적용                             |
| 기존 Node 서버              | JSON을 읽어 실제 응답에 `response.setHeader(name, value)` 적용             |
| `_headers` 지원 정적 호스팅 | 생성된 파일을 최종 업로드 디렉터리에 유지하고 해당 호스트의 지원 범위 확인 |
| Nginx·프록시·SSR·API        | 정책 값을 서버/프록시의 실제 응답 헤더로 구성                              |

기존 Node 서버의 기본 적용 코드는 다음과 같습니다. 정적 파일 처리와 오류 응답에도 같은 정책을 적용하세요.

```js
import { readFile } from "node:fs/promises";

const headers = JSON.parse(
  await readFile(
    new URL("./dist/webguard-headers.json", import.meta.url),
    "utf8",
  ),
);

// 서버의 요청 처리 함수에서, 응답을 보내기 전에 실행
for (const [name, value] of Object.entries(headers)) {
  response.setHeader(name, value);
}
```

Nginx 예시입니다. 아래 최소 CSP는 외부 API·폰트·이미지 등을 허용하지 않습니다. 실제 앱에 맞춘 생성 JSON 값을 반영하세요. 중복 CSP 헤더를 무작정 추가하면 서로 다른 정책이 동시에 적용됩니다.

```nginx
# 해당 server 블록 안에 적용
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'" always;
add_header X-Content-Type-Options "nosniff" always;

# 로컬 경로를 담은 보고서와 서버용 제어 파일은 공개하지 않음
location ~ ^/(webguard-report\.json|webguard-headers\.json|_headers)$ {
    return 404;
}
```

정책·보고서 파일은 서버가 읽을 신뢰된 빌드 산출물입니다. 원본 소스·비밀키·개인 소스맵을 공개 디렉터리에 두지 말고, `webguard-report.json`의 로컬 경로도 외부에 노출하지 마세요. `webguard-manifest.json`은 공개 리소스 해시를 담습니다.

```sh
curl -I https://YOUR-SITE.example/
```

실제 응답에서 `Content-Security-Policy`와 `X-Content-Type-Options: nosniff`를 확인하세요. `_headers` 파일 존재만으로 적용됐다고 판단하면 안 됩니다.

## 5. 기존 앱과 호환성 조정

외부 API·폰트 등은 필요한 정확한 출처만 추가합니다. 다음은 외부 API 허용과 Trusted Types 호환성 점검 예시입니다.

```ts
webguardApp({
  headers: {
    trustedTypes: "report-only",
    allowedOrigins: {
      connect: ["https://api.example.com"],
    },
  },
});
```

기본 Trusted Types 강제 정책은 `innerHTML` 같은 문자열 DOM 삽입이나 외부 위젯을 막을 수 있습니다. `report-only`로 호환성을 점검한 뒤 `enforce`로 전환하세요. 이 옵션은 Trusted Types 점검만 조정하며, 나머지 CSP의 인라인·외부 스크립트 제한은 유지됩니다. 원격 보고 서버가 자동으로 설치되지는 않습니다.

기존 호스트 헤더를 유지하려면 `headers: false`로 두고 서버에 직접 적용하세요. 기존 `_headers`나 출력 정책과 충돌하면 덮어쓰지 않고 빌드가 실패합니다. `runtime: false`는 자동 SDK만 끄고 빌드 보호는 유지합니다. 성능을 비교하려면 `preset: "standard"`로 낮출 수 있습니다.

자동 초기화 없이 SDK만 직접 사용할 수도 있습니다. 자동 SDK와 중복 초기화하지 마세요.

```ts
import { WebGuard } from "uulab-webguard/browser";
const guard = WebGuard.init({ devtools: { blockShortcuts: true } });
// 화면/앱 종료 시
guard.destroy();
```

서버에서 정책 문자열만 생성하려면 `import { createSecurityHeaders } from "uulab-webguard/headers"`를 사용하세요. 이 진입점은 서버용이며 앱의 브라우저 코드에서는 `/client` 또는 `/browser`를 사용합니다.

## 6. 문제 해결

- **개발 모드에서 F12가 열림:** `npm run build` 후 빌드 결과를 확인하세요.
- **빌드 후에도 제한이 안 됨:** 옵션의 `true`, SDK 시작 여부와 입력창 밖의 포커스를 확인하세요. 브라우저 소유 동작에는 제한이 있습니다.
- **화면 또는 위젯이 깨짐:** 브라우저의 CSP/Trusted Types 오류, 필요한 정확한 외부 출처와 난독화 전후 동작을 확인하세요.
- **SDK와 헤더 파일이 없음:** `webguard()` 대신 `webguardApp()`을 사용했는지 확인하세요.
- **배포 후 헤더가 없음:** 호스트가 생성 정책을 실제 응답에 반영하도록 설정하세요.
- **npm 패키지를 찾을 수 없음:** `npm view uulab-webguard version --registry=https://registry.npmjs.org`으로 공개 상태와 이름을 확인하세요.

공개 소스는 MIT 라이선스이고 난독화 엔진의 BSD-2-Clause 고지를 함께 제공합니다. 자세한 라이선스는 설치 패키지의 `LICENSE`와 `THIRD_PARTY_NOTICES.md`를 확인하세요.
