# Webpack · esbuild에 WebGuard 적용하기

기존 번들러가 만든 **정적 HTML·JavaScript 출력**을 보호합니다. Webpack·esbuild 전용 플러그인을 새로 설치할 필요 없이 빌드 뒤에 한 단계를 연결합니다.

[환경 다시 선택](https://webguard.uulab.co.kr/docs/#install) · [범용 CLI 명세](API_INTEGRATIONS.ko.md#webguard-cli)

## 준비 사항

- Node.js 22.12 이상. pnpm 11은 Node.js 22.13 이상이 필요합니다.
- 기존 빌드가 `dist`에 HTML·JS를 내보내야 합니다. 경로가 다르면 아래 `dist`를 실제 출력으로 바꾸세요.
- 서버 번들·프로젝트 루트·`.next`·WAR/JAR는 이 후처리에 넣지 않습니다.

## 1. 패키지 설치

[설치 명령 복사](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 사용하는 도구의 고정 URL 명령을 앱 폴더에서 실행합니다. npm 게시는 보류 중입니다.

파일을 받은 경우 `.tgz`를 앱 폴더에 저장하고 실행합니다.

```sh
npm install -D ./uulab-webguard-0.3.0.tgz
```

## 2. 빌드 스크립트 연결

**수정할 파일: `package.json`**. 원래 빌드 명령을 `build:raw`로 유지하고 보호 단계를 뒤에 연결합니다. 아래는 Webpack 예제입니다.

```json
{
  "scripts": {
    "build:raw": "webpack --mode production",
    "guard:build": "webguard protect-app dist --output dist-protected --trusted-types report-only --restrict-shortcuts --restrict-context-menu",
    "build": "npm run build:raw && npm run guard:build",
    "preview:protected": "webguard-serve dist-protected --port 4173"
  }
}
```

esbuild는 `build:raw`에 기존 esbuild 명령을 그대로 둡니다. `guard:build`는 같습니다. 자동 SDK 초기화·JavaScript 난독화·SRI·정책 생성을 함께 연결합니다.

이 예제는 로더의 문자열 DOM 동작을 위해 Trusted Types **관찰 모드**를 명시합니다. 해당 삽입을 차단하지 않으며 관찰에는 실제 HTTP 헤더가 필요합니다. 앱 호환성을 확인한 뒤 강제 모드로 변경할 수 있습니다.

## 3. 빌드·실행

```sh
npm run build
npx --no-install webguard doctor dist-protected
npm run preview:protected
```

`http://127.0.0.1:4173`을 엽니다.

**보호 출력은 새 폴더여야 합니다.** `dist-protected`가 이미 있으면 덮어쓰지 않습니다. 로컬에서 다음 빌드를 시험할 때는 새 출력 경로를 지정하고 진단·서버 명령도 같은 경로로 맞추세요. 깨끗한 CI 작업 공간에서는 같은 스크립트를 재사용할 수 있습니다.

## 4. 정상 결과 확인

- `doctor`가 `WebGuard: Local check passed.`를 출력합니다.
- 원래 `dist`는 유지되고 `dist-protected`에 보호 결과가 생깁니다.
- 스크립트 순서·동적 청크·폼·페이지 이동을 브라우저에서 확인합니다.
- 다른 터미널에서 실제 응답도 검사합니다.

```sh
npx --no-install webguard-check dist-protected --url http://127.0.0.1:4173/
```

## 문제 해결

| 증상                          | 먼저 확인할 것                                                 |
| ----------------------------- | -------------------------------------------------------------- |
| 출력 폴더가 이미 있다는 오류  | 기존 결과를 보존하고 새 보호 출력 경로 지정                    |
| 인라인 이벤트·스타일 CSP 오류 | 외부 파일·이벤트 리스너로 옮기거나 기존 정책을 명시적으로 관리 |
| `.js.gz`·`.br` 오류           | 보호 전 사전 압축을 끄고 최종 파일을 HTTP 압축으로 전송        |
| 동적 청크가 안 열림           | 원래 빌드의 공개 base와 실제 배포 경로가 같은지 확인           |

## 다음 단계

**`dist-protected`만 배포합니다.** 원본 `dist`를 함께 올리지 마세요. 생성 헤더와 비공개 경로 제한을 호스트에 적용합니다. 파일명은 그대로이므로 릴리스 경로 또는 재검증 캐시를 사용하고 서비스 워커·외부 SRI는 최종 바이트로 갱신하세요.

[Webpack 예제](https://github.com/bonjin-app/webguard/blob/main/examples/webpack/README.md) · [esbuild 예제](https://github.com/bonjin-app/webguard/blob/main/examples/esbuild/README.md)
