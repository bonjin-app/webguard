# Vite · React · Vue에 WebGuard 적용하기

기존 Vite 7/8 웹 앱에 적용합니다. React·Vue 플러그인은 유지하고 WebGuard만 추가하세요. **프로덕션 빌드의 JavaScript 난독화·SDK 시작·SRI·정책 생성**을 연결합니다.

[환경 다시 선택](https://webguard.uulab.co.kr/docs/#install) · [함수와 옵션](API_INTEGRATIONS.ko.md#webguardapp)

## 준비 사항

- Node.js 22.12 이상. pnpm 11은 Node.js 22.13 이상이 필요합니다.
- 기존 앱의 `package.json`과 `vite.config.ts` 또는 `vite.config.js`가 있는 폴더에서 실행합니다.
- 이 경로는 브라우저 앱용입니다. Vite SSR 서버 번들·라이브러리 빌드는 대상이 아닙니다.

## 1. 패키지 설치

[설치 명령 복사](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 npm·pnpm 중 사용하는 도구를 선택하고, 고정 URL 명령을 앱 폴더에서 실행하세요. npm 게시는 보류 중이므로 `@latest`로 이 후보를 설치하지 않습니다.

파일로 받은 경우에는 `.tgz`를 `package.json` 옆에 저장한 뒤 실행합니다.

```sh
npm install -D ./uulab-webguard-0.3.0.tgz
```

## 2. 기존 Vite 설정 수정

**수정할 파일: `vite.config.ts` 또는 `vite.config.js`.** 아래는 React 예제입니다. 기존 `react()`와 다른 플러그인·alias·서버 설정을 지우지 마세요.

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { webguardApp } from "uulab-webguard";

export default defineConfig({
  plugins: [
    react(),
    webguardApp({
      runtime: {
        devtools: { blockShortcuts: true, blockContextMenu: true },
      },
    }),
  ],
});
```

Vue는 기존 `vue()`를 유지하고 같은 `webguardApp(...)` 항목만 추가합니다. 일반 Vite 앱도 기존 `plugins` 배열에 추가하면 됩니다. SDK를 앱 코드에서 다시 초기화할 필요는 없습니다.

**일반 Vite 원본 템플릿의 `innerHTML`을 그대로 쓰는 경우:** `webguardApp` 옵션에 `headers: { trustedTypes: "report-only" }`를 명시하거나 안전한 DOM API로 바꾸세요. 관찰 모드는 해당 문자열 삽입을 차단하지 않습니다. [프로젝트별 설정 생성기](https://webguard.uulab.co.kr/demo#setup)를 이용할 수도 있습니다.

## 3. 빌드·실행

```sh
npm run build
npx --no-install webguard doctor dist
npx --no-install webguard-serve dist --port 4173
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. `build.outDir`를 바꿨다면 위 `dist`도 실제 출력 폴더로 바꾸세요. 개발 서버인 `npm run dev`에는 빌드 보호가 적용되지 않습니다.

## 4. 정상 결과 확인

- 진단 명령이 `WebGuard: Local check passed.`를 출력합니다.
- `dist`에 `webguard-manifest.json`, `webguard-headers.json`이 생성됩니다.
- 실제 페이지의 렌더링·버튼·폼·이동이 동작해야 합니다. 진단 통과만으로 앱 동작을 확인한 것은 아닙니다.
- JavaScript는 보호된 코드이고 공개 소스맵이 제거됩니다. 브라우저에 전달한 파일은 계속 열람할 수 있습니다.

다른 터미널에서 로컬 HTTP 정책과 바이트도 확인합니다.

```sh
npx --no-install webguard-check dist --url http://127.0.0.1:4173/
```

## 문제 해결

| 증상                                 | 먼저 확인할 것                                                              |
| ------------------------------------ | --------------------------------------------------------------------------- |
| React·Vue 화면이 깨짐                | 원래 프레임워크 플러그인을 유지했는지 확인                                  |
| `WG_TRUSTED_TYPES_SINK` 또는 빈 화면 | 문자열 HTML 삽입을 확인하고 DOM API 수정 또는 관찰 모드를 명시              |
| 외부 API·폰트가 차단됨               | [허용 출처 설정](API_BUILD.ko.md#securityheadersoptions)을 검토하고 재빌드  |
| `doctor`가 파일 변경을 보고함        | 같은 빌드의 최종 폴더를 검사하고, 기준 매니페스트를 임의로 다시 만들지 않기 |

## 다음 단계

**배포할 폴더는 `dist`입니다.** 호스트에 생성 HTTP 정책과 비공개 경로 제한을 적용하고 실제 URL로 `webguard-check`를 실행하세요. `webguard-serve`는 로컬 확인용이며 운영 HTTPS 서버가 아닙니다.

[운영 호스트 정책](INSTALL.ko.md#5-운영-호스트에도-http-정책과-비공개-경로-적용) · [실행 가능한 React 예제](https://github.com/bonjin-app/webguard/blob/main/examples/react-vite/README.md)
