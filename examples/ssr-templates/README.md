# Python·PHP 서버 렌더링에 WebGuard 적용하기

서버 언어를 난독화하지 않고 **브라우저로 내려가는 정적 JavaScript**만 빌드 시 보호하는 실행 예제입니다. Vite·React·웹 프레임워크 의존성이 없습니다. Python은 표준 WSGI, PHP는 PHP 8 라우터를 사용합니다.

요청마다 서버에서 인사와 새로운 요청 ID를 HTML로 렌더링하며, 브라우저는 보호된 SDK·초기화·앱 스크립트를 순서대로 실행합니다. 카운터, 서버 API, 검사 단축키·우클릭 제한을 켜고 끄는 체험을 포함합니다.

## 저장소에서 실행

저장소 루트에서 Node 22.12+, pnpm으로 빌드합니다. npm 게시 없이 현재 소스를 사용합니다.

```sh
pnpm build
node scripts/prepare-ssr-templates.mjs
python3 examples/ssr-templates/python/server.py --port 4190
```

`http://127.0.0.1:4190/?name=홍길동`으로 접속합니다. PHP 8이 있으면 별도 터미널에서 실행합니다.

```sh
php -S 127.0.0.1:4191 -t .demo-dist/ssr-templates/public examples/ssr-templates/php/router.php
```

`http://127.0.0.1:4191/?name=홍길동`으로 접속합니다. 두 명령은 개발용 서버입니다. 실제 호스팅에서는 WSGI 서버 또는 PHP-FPM·Apache의 라우팅과 같은 헤더·파일 접근 제한을 연결해야 합니다.

준비 스크립트는 원본을 덮어쓰지 않으며 빈 출력 폴더만 받습니다. 재빌드는 새 폴더를 지정합니다.

```sh
node scripts/prepare-ssr-templates.mjs --output /tmp/webguard-ssr-new-build
WEBGUARD_SSR_OUTPUT=/tmp/webguard-ssr-new-build WEBGUARD_BASE_PATH=/app/ \
  python3 examples/ssr-templates/python/server.py --port 4192
```

이 경우 `http://127.0.0.1:4192/app/`입니다. PHP에도 같은 환경 변수를 사용할 수 있습니다. `/assets/`와 API 경로는 이 접두사에 맞게 생성됩니다. 서버 예제 자체는 파일시스템으로 요청을 넘기지 않고 허용한 정확한 경로만 처리합니다.

## 무엇이 적용되나요?

| 단계         | 적용 내용                                                               |
| ------------ | ----------------------------------------------------------------------- |
| 빌드         | SDK, `init.js`, `app.js`를 Strict로 실제 난독화                         |
| 출력 분리    | `public/assets/`에는 허용된 JS·CSS 네 파일만 복사                       |
| 무결성       | 변환이 끝난 최종 바이트의 SHA-384를 각 `script`·CSS의 SRI로 지정        |
| 서버 응답    | HTML·API·자산·404·405에 실제 CSP, `nosniff`, 프레임 제한, Referrer 정책 |
| 브라우저 SDK | 외부 `init.js`로 초기화, 단축키·우클릭 제한 ON/OFF                      |
| 비공개 자료  | 템플릿·정책·보고서·소스맵은 `private/`에 보관하고 HTTP 공개하지 않음    |

Python·PHP 서버 소스나 HTML 템플릿 안의 임의 인라인 `<script>`를 자동으로 변환하는 예제가 아닙니다. 앱 코드는 `assets-src/`의 외부 JS로 분리합니다. 초기화 순서는 SDK → init → 앱이며 모두 `defer`이므로 SSR HTML과 함께 사용할 수 있습니다. CSP는 인라인 스크립트·`eval`을 허용하지 않습니다.

설치한 패키지에서 같은 빌드 과정을 구성할 때는 `uulab-webguard/build`의 `protectDirectory()`와 `uulab-webguard/browser.global.js`를 사용합니다. 저장소의 준비 스크립트는 현재 워크스페이스 산출물을 읽습니다. 서버 시작·요청마다 Node나 난독화를 실행할 필요는 없습니다. 서버 인증·권한·가격 검증은 기존 백엔드가 담당합니다.

## 자동 검증

```sh
node scripts/verify-ssr-templates.mjs --evidence /tmp/webguard-ssr-results.json
```

준비 스크립트부터 실제 로컬 서버를 실행하고, `/app/` 접두사의 HTML·API·자산·비공개 경로, 서버 출력 이스케이프와 요청별 동적 렌더링을 검사합니다. Chromium·Firefox·WebKit에서 카운터, API, 실제 키 입력의 가드 ON/OFF, CSP 인라인 삽입 거부, 변조된 JS의 SRI 거부를 검사합니다. 단축키 검증은 자동화 브라우저가 페이지로 전달한 trusted 입력에 대한 결과이며 모든 OS·브라우저 메뉴 제어를 증명하지 않습니다.

PHP 실행 파일이 없으면 PHP는 **건너뜀**으로 보고하며 성공으로 간주하지 않습니다. `WEBGUARD_PYTHON`·`WEBGUARD_PHP`로 다른 설치 경로를 지정할 수 있습니다.

네이티브 PHP가 없는 환경의 선택적 검증에는 [WordPress Playground의 PHP WASM](https://developer.wordpress.org/playground/developers/local-development/php-wasm-node/)을 사용할 수 있습니다. 이 테스트 도구는 PHP 8.4 인터프리터로 **같은 `router.php`**를 실행하여 HTTP로 연결하며, 제품 SDK나 배포 서버의 의존성이 아닙니다. PHP-FPM·Apache 검증과 구분합니다.

```sh
# 저장소 밖의 임시 폴더에만 설치. 이 버전의 런타임 요구사항: Node >=24.18.
npm install --prefix /tmp/webguard-php-wasm --ignore-scripts --no-audit --no-fund \
  @php-wasm/node@3.1.60 @php-wasm/universal@3.1.60
WEBGUARD_PHP_WASM_MODULES=/tmp/webguard-php-wasm/node_modules \
WEBGUARD_PHP_WASM_NODE=/absolute/path/to/node24 \
  node scripts/verify-ssr-templates.mjs --evidence /tmp/webguard-ssr-results.json
```

브라우저가 받은 코드는 여전히 열람·분석할 수 있고, 난독화는 암호화가 아닙니다. SDK는 개발자도구를 강제로 닫거나 브라우저 메뉴를 비활성화하지 않습니다. 이 예제의 입력 제한은 명시적으로 켠 정책입니다.
