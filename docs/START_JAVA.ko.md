# Java · JSP에 WebGuard 적용하기

**내 서버의 브라우저 JavaScript를 보호하는 순서**입니다. 서버 언어·템플릿 자체는 난독화하지 않습니다. 저장소 예제 실행은 맨 아래에 따로 있습니다.

## 준비 사항

- 빌드 머신: Node **22.12 이상**, npm. 서버 요청마다 Node를 실행하지 않습니다.
- 서버: Java 17 이상, Maven, Tomcat 10.1 이상(Jakarta Servlet 6).
- 기존 앱을 백업하고 인라인 JS를 외부 파일로 옮깁니다. 인증·권한 검증은 기존 서버에서 유지합니다.

## 1. 설치

[다운로드 화면](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 **빌드 도구 패키지 `.tgz`**를 받아 적용할 프로젝트 루트에 `uulab-webguard-0.3.0.tgz`로 저장합니다. 그 폴더에서 실행하세요.

```sh
npm install --save-dev ./uulab-webguard-0.3.0.tgz
```

다운로드 대신 화면의 **고정 URL 설치 명령**을 그대로 복사해도 됩니다. npm 게시는 보류 중이므로 `npm install uulab-webguard`로 이 후보가 설치된다고 가정하지 마세요.

## 2. 클라이언트 JS와 JSP 공통 레이아웃 수정

프로젝트 루트에 `webguard-src/` 폴더를 만들고 보호할 앱 JS를 `webguard-src/app.js`로 옮깁니다. SDK 파일은 아래 빌드 파일이 설치된 패키지에서 자동으로 복사합니다.

`webguard-src/init.js`를 새로 만듭니다.

```js
window.webguard = WebGuardSDK.WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
```

JSP 공통 레이아웃에서는 **SDK → init → app** 순서로 외부 스크립트를 불러옵니다. 아래 빌드 후 출력되는 태그 3개를 기존 앱 스크립트 대신 넣으세요. 다른 앱 파일이 있다면 같은 방식으로 추가합니다.

## 3. 빌드·실행

프로젝트 루트에 `scripts/` 폴더를 만들고 다음을 **`scripts/webguard-assets.mjs`**로 저장합니다. `TARGET`은 기존 서버의 정적 파일 폴더이며 `ASSET_BASE`는 브라우저에서 사용하는 URL입니다. 실제 서비스 경로에 맞춰 두 값을 확인하세요.

```js
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { protectDirectory } from "uulab-webguard/build";

const require = createRequire(import.meta.url);
const SOURCE = "webguard-src";
const OUTPUT = "webguard-built";
const TARGET = "src/main/webapp/assets/webguard";
const ASSET_BASE = "${pageContext.request.contextPath}/assets/webguard";
const files = ["webguard.global.js", "init.js", "app.js"];

await copyFile(
  require.resolve("uulab-webguard/browser.global.js"),
  `${SOURCE}/webguard.global.js`,
);
await protectDirectory(SOURCE, {
  output: OUTPUT,
  privateArtifactsDir: ".webguard-private/maps",
  config: { preset: "strict" },
});
await mkdir(dirname(TARGET), { recursive: true });
await mkdir(TARGET);
for (const name of files) {
  const bytes = await readFile(`${OUTPUT}/${name}`);
  await copyFile(
    `${OUTPUT}/${name}`,
    `${TARGET}/${name}`,
    constants.COPYFILE_EXCL,
  );
  const sri = "sha384-" + createHash("sha384").update(bytes).digest("base64");
  console.log(
    `<script defer src="${ASSET_BASE}/${name}" integrity="${sri}" crossorigin="anonymous"></script>`,
  );
}
```

프로젝트 루트에서 실행할 명령은 하나입니다.

```sh
node scripts/webguard-assets.mjs
```

출력되는 태그 3개를 위 공통 레이아웃에 붙입니다. JavaScript 파일만 공개 폴더로 복사하며 보고서·소스맵·원본은 공개하지 않습니다. `webguard-src/webguard.global.js`는 매번 SDK에서 생성하므로 직접 편집하지 마세요.

`OUTPUT`·비공개 맵 폴더·`TARGET`은 **새 경로**여야 합니다. 재빌드할 때 세 경로와 `ASSET_BASE`를 새 릴리스 경로로 함께 변경하세요. 기존 결과를 지우거나 덮어쓰지 않고 생성 후 검토합니다. 다른 앱 파일은 `files`와 공통 레이아웃에도 명시적으로 추가하세요.

[WebGuardFilter.java](https://github.com/bonjin-app/webguard/blob/main/examples/jsp-servlet/src/main/java/dev/webguard/WebGuardFilter.java)의 응답 헤더 설정을 기존 Filter에 통합하고, [web.xml](https://github.com/bonjin-app/webguard/blob/main/examples/jsp-servlet/src/main/webapp/WEB-INF/web.xml)의 매핑을 참고하세요. **예제의 작은 경로 허용 목록을 서비스 전체에 그대로 복사하지 마세요.** 오류·정적 파일 응답에도 정책이 적용되는지 확인합니다.

기존 CSP에 동작 중인 외부 출처·nonce가 있다면 병합해 시험하세요. `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, HTTP의 `frame-ancestors`와 `nosniff`가 기본 점검 대상입니다. 파일 교체 시 SRI도 갱신하고 릴리스별 URL 또는 재검증 캐시를 사용합니다.

이제 **기존 서비스의 빌드·시작·배포 명령**을 실행합니다. 난독화는 배포 전에 한 번 수행하며 매 HTTP 요청에서 수행하지 않습니다.

## 4. 정상 결과 확인

1. 페이지의 기존 버튼·로그인·API가 이전처럼 동작해야 합니다.
2. Network에서 JS 3개가 `200`, Sources에서는 변환된 JS가 보여야 합니다. 원본 소스맵이 공개되지 않아야 합니다.
3. 콘솔에서 `window.webguard`가 생성되어 있고 SRI·CSP 로딩 오류가 없어야 합니다.
4. 페이지가 전달받은 검사 단축키·우클릭을 제한하는지 확인합니다. 브라우저 메뉴나 이미 열린 개발자도구를 강제로 닫는 기능은 아닙니다.
5. HTML·자산·API·오류 응답의 HTTP 헤더와 비공개 파일의 `404`를 확인합니다.

## 문제 해결

- **앱이 실행되지 않음:** 스크립트 순서·실제 URL·SRI를 먼저 확인하세요. CDN/프록시의 추가 JS 변환을 끕니다.
- **CSP 오류:** 인라인 초기화·이벤트 속성을 외부 JS로 옮기고 기존 정책과 충돌하는 출처를 확인하세요.
- **템플릿 경로 오류:** 위 경로는 이 가이드의 예시입니다. 서비스의 컨텍스트 경로·정적 파일 매핑과 맞춰야 합니다.

## 다음 단계

[브라우저 함수 명세](API_BROWSER.ko.md) · [빌드 함수 명세](API_BUILD.ko.md) · [서버 통합](https://github.com/bonjin-app/webguard/blob/main/examples/server-templates/README.md)

### 선택: 저장소의 실행 예제부터 보기

아래는 **패키지 설치 앱이 아닌 WebGuard 저장소 루트**에서만 실행합니다. 저장소를 받은 뒤 Node **22.13 이상**·pnpm **11**로 `pnpm install --frozen-lockfile`을 먼저 실행하세요. 준비 스크립트와 서버 예제 원본은 `.tgz`에 포함되지 않습니다.

```sh
pnpm build
node scripts/prepare-jsp.mjs
mvn -B -f examples/jsp-servlet/pom.xml package
node scripts/verify-jsp-artifact.mjs
```

생성된 `examples/jsp-servlet/target/webguard.war`를 Tomcat에 배포한 뒤 `/webguard/`에서 **Call Servlet**을 누릅니다. `Servlet: ok, answer 42`가 정상 신호입니다. Maven 검증은 내장 Tomcat을 사용하며 별도 운영 Tomcat 배포 성공을 대신하지 않습니다.

[실행 예제 상세](https://github.com/bonjin-app/webguard/blob/main/examples/jsp-servlet/README.md)에서 하위 경로와 검증 범위를 확인하세요.
