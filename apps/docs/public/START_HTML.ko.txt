# 일반 HTML · jQuery에 WebGuard 적용하기

번들러가 없는 정적 사이트에도 적용할 수 있습니다. 여기서는 **앱 JavaScript 난독화와 자동 SDK 연결**을 함께 사용합니다. 런타임 가드만 필요하다면 [CDN 안내](START_CDN.ko.md)를 선택하세요.

[환경 다시 선택](https://webguard.uulab.co.kr/docs/#install) · [범용 CLI 명세](API_INTEGRATIONS.ko.md#webguard-cli)

## 준비 사항

- 빌드 작업에 Node.js 22.12 이상이 필요합니다. pnpm 11은 22.13 이상입니다.
- 실제 배포할 HTML·JS·CSS만 `public-src` 같은 전용 폴더에 모읍니다.
- PHP·JSP 템플릿·`.env`·서버 소스가 들어 있는 프로젝트 루트를 입력으로 쓰지 마세요.

## 1. 패키지 설치

[설치 명령 복사](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 npm·pnpm 고정 URL 명령을 프로젝트 폴더에서 실행합니다. npm 게시는 보류 중입니다.

파일을 받은 경우 `.tgz`를 프로젝트 폴더에 저장하고 실행합니다.

```sh
npm install -D ./uulab-webguard-0.3.0.tgz
```

## 2. 배포용 파일 준비

예시 구조입니다. 입력 이름은 달라도 되지만 아래 명령과 동일하게 맞추세요.

```text
public-src/
  index.html
  assets/
    app.js
    style.css
```

**수정할 파일: `public-src/index.html`.** 인라인 이벤트·스타일 대신 외부 파일을 사용합니다. 기존 앱 내용과 스크립트 순서는 유지하세요.

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/assets/style.css" />
  </head>
  <body>
    <button id="counter">0</button>
    <script src="/assets/app.js" defer></script>
  </body>
</html>
```

jQuery를 쓰면 앱보다 먼저 로드합니다. 같은 폴더의 JS도 보호하려면 로컬 파일로 포함하세요. 다른 출처 CDN 코드는 이 명령이 자동으로 내려받아 변환하지 않습니다.

## 3. 보호·실행

```sh
npx --no-install webguard protect-app public-src --output public-protected --trusted-types report-only --restrict-shortcuts --restrict-context-menu
npx --no-install webguard doctor public-protected
npx --no-install webguard-serve public-protected --port 4173
```

`http://127.0.0.1:4173`을 엽니다. SDK는 자동으로 앱보다 먼저 시작하므로 수동 `WebGuard.init()` 태그를 추가하지 않습니다.

jQuery 호환성을 위해 Trusted Types 관찰 모드를 명시했습니다. 문자열 HTML 삽입 차단이 아니며 실제 HTTP 헤더가 필요합니다. 강제 모드는 앱 호환성을 확인한 뒤 선택하세요.

## 4. 정상 결과 확인

- `doctor`가 `WebGuard: Local check passed.`를 출력합니다.
- `public-protected`에 SRI가 연결된 HTML과 보호된 JS·정책 파일이 생깁니다.
- 버튼·jQuery 플러그인·폼이 동작해야 합니다. 입력 제한은 페이지에 전달된 이벤트에만 적용됩니다.
- 다른 터미널에서 HTTP 응답도 확인합니다.

```sh
npx --no-install webguard-check public-protected --url http://127.0.0.1:4173/
```

## 문제 해결

| 증상                         | 먼저 확인할 것                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| CSP가 onclick·style을 거부함 | 앱 동작은 외부 JS의 이벤트 리스너, 스타일은 외부 CSS로 옮기기                           |
| 다른 경로의 JS가 그대로 보임 | 보호 입력에 포함된 배포용 JS인지 확인                                                   |
| 기존 CSP와 충돌함            | 자동 정책을 중복 추가하지 말고 [직접 관리 옵션](API_BUILD.ko.md#protectappoptions) 확인 |
| 기존 출력 폴더 오류          | 새 보호 출력 경로를 지정하고 서버·검사 경로도 함께 변경                                 |

## 다음 단계

**`public-protected`만 배포합니다.** 원본 폴더는 공개하지 않고 생성 HTTP 정책·비공개 경로 제한을 호스트에 적용합니다. 이 로컬 서버는 운영 HTTPS·로그인·SPA 라우팅을 자동 제공하지 않습니다.

[실행 가능한 HTML·jQuery 예제](https://github.com/bonjin-app/webguard/blob/main/examples/plain-html/README.md) · [서버 환경 안내](ENVIRONMENTS.ko.md)
