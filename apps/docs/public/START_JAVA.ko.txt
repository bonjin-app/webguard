# Java · JSP에 WebGuard 적용하기

**npm 없이 파일을 내려받아 적용할 수 있습니다.** 기본 방법은 **SDK·초기화 파일 다운로드 → 프로젝트에 복사 → JSP에서 연결 → 기존대로 배포**입니다. 운영 Java 서버에 Node·npm을 설치하지 않습니다.

| 원하는 적용 범위            | 사용할 방법                       | Node·패키지 관리자  |
| --------------------------- | --------------------------------- | ------------------- |
| 브라우저 SDK 가드 연결      | 아래 1~4단계: 파일 직접 다운로드  | 필요 없음           |
| 내 앱 JavaScript까지 난독화 | 아래 선택 항목: 배포 전 빌드 보호 | 개발 PC·CI에만 필요 |

제공 SDK 자체는 이미 난독화되어 있습니다. 파일 두 개를 연결한다고 **기존 앱의 JS·JSP·Java 코드까지 자동 난독화되지는 않습니다.**

## 준비 사항

- 기존 JSP의 공통 레이아웃과 정적 파일 폴더를 수정할 수 있어야 합니다.
- 아래 폴더 예시는 Maven WAR 프로젝트 기준입니다. 다른 구조는 실제 공개 정적 파일 경로로 맞추세요.
- 기존 자동 SDK 통합이 있다면 수동 초기화를 중복 연결하지 않습니다.

## 1. 파일 다운로드

아래 링크를 눌러 받습니다. `.tgz` 패키지는 이 방법에 필요하지 않습니다.

| 받을 파일                                                                                                                | 역할                         |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| [webguard.global.js 다운로드](https://webguard.uulab.co.kr/downloads/releases/0.3.0-7fffc24439d4935b/webguard.global.js) | 이미 난독화된 브라우저 SDK   |
| [webguard-init.js 다운로드](https://webguard.uulab.co.kr/downloads/releases/0.3.0-7fffc24439d4935b/webguard-init.js)     | 단축키·우클릭 등 초기화 설정 |
| [라이선스 고지 다운로드](https://webguard.uulab.co.kr/downloads/releases/0.3.0-7fffc24439d4935b/THIRD_PARTY_NOTICES.txt) | SDK와 함께 보관할 라이선스   |

위 파일은 함께 검증한 고정 릴리스 `0.3.0-7fffc24439d4935b`입니다. 다른 릴리스로 교체할 때는 SDK·초기화 파일·SRI를 함께 검토하세요. [현재 다운로드 목록](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서도 받을 수 있습니다.

## 2. 받은 파일을 프로젝트에 복사

```text
내 프로젝트/
└─ src/main/webapp/
   ├─ assets/webguard/
   │  ├─ webguard.global.js         ← 받은 SDK
   │  ├─ webguard-init.js           ← 받은 초기화 파일
   │  └─ THIRD_PARTY_NOTICES.txt     ← 받은 라이선스
   └─ WEB-INF/jspf/
      └─ webguard.jspf              ← 아래 코드로 새로 만들 파일
```

`WEB-INF`는 브라우저에서 직접 접근할 수 없는 위치입니다. **JS 두 파일은 `WEB-INF` 안에 넣지 마세요.** 기존 파일이 있다면 백업하고 새 릴리스 폴더에서 먼저 시험합니다.

받은 초기화 파일은 단축키·우클릭 제한을 켜고, 크기 추정 감지는 끈 예제입니다. 옵션을 바꾸려면 **`assets/webguard/webguard-init.js`**만 수정하세요. SDK 본체는 편집하지 않습니다. 이미 `WebGuardSDK.WebGuard.init()`이 들어 있으므로 JSP에 초기화 코드를 다시 쓰지 않습니다.

## 3. JSP 공통 레이아웃에 연결

**새 파일: `src/main/webapp/WEB-INF/jspf/webguard.jspf`**. 다음 두 줄을 그대로 저장합니다.

```jsp
<script defer src="${pageContext.request.contextPath}/assets/webguard/webguard.global.js"
        integrity="sha384-GH+Vj4IC8FkwuiSeVMsO+w0UhYCvgsQUtRyiXM+gNu8uRr3ppKGlKjFeeq/joV9L" crossorigin="anonymous"></script>
<script defer src="${pageContext.request.contextPath}/assets/webguard/webguard-init.js"></script>
```

**수정할 파일: 공통 레이아웃 JSP**. `<head>` 안에서 기존 앱 스크립트보다 앞에 다음 한 줄을 넣습니다.

```jsp
<%@ include file="/WEB-INF/jspf/webguard.jspf" %>
```

루트에 배포하든 `/myapp` 아래에 배포하든 `request.contextPath`가 실제 앱 경로를 붙입니다. 정적 자산을 다른 경로로 제공한다면 **파일을 둔 위치와 태그의 URL을 함께** 변경하세요.

SDK·초기화·앱을 이 순서로 실행하려면 기존 앱 JS도 외부 파일로 연결하고 `defer`를 사용합니다. `async`를 섞지 마세요. 인라인 스크립트의 실행 순서는 `defer`로 조정할 수 없습니다.

기존 CSP가 있으면 이 두 파일의 실제 출처를 허용하세요. 초기화 코드는 외부 파일로 유지하고 기존 CSP를 지우거나 `unsafe-inline`을 추가하지 않습니다. 이 방식은 서버 보안 헤더를 자동 설정하지 않습니다. [서버 정책 적용 안내](ENVIRONMENTS.ko.md)를 참고하세요.

## 4. 기존 방식으로 배포하고 확인

평소 쓰는 Java 빌드·WAR 배포·서버 재시작 절차를 그대로 사용합니다. **새 npm 명령은 없습니다.**

1. `/내앱경로/assets/webguard/webguard.global.js`와 `webguard-init.js` 요청이 `200`인지 확인합니다. 루트 배포라면 `/assets/webguard/…`입니다.
2. 콘솔에 `WebGuardSDK is not defined`, SRI·CSP 오류가 없어야 합니다. `window.webguard`가 생성되어야 합니다.
3. 페이지로 전달되는 검사 단축키와 우클릭 제한을 시험합니다. 초기화 파일에서 옵션을 끄면 해당 제한도 꺼져야 합니다.
4. 기존 버튼·폼·로그인·API가 계속 동작하는지 확인합니다.

브라우저 메뉴나 이미 열린 개발자도구 창을 강제로 닫는 기능은 아닙니다. SDK의 입력 제한과 서버 인증·권한 검증은 별개입니다.

## 문제 해결

| 증상                         | 확인할 것                                                                  |
| ---------------------------- | -------------------------------------------------------------------------- |
| JS 요청이 `404`              | 파일이 공개 정적 폴더에 있는지, 컨텍스트 경로·서버 정적 매핑이 맞는지 확인 |
| `WebGuardSDK is not defined` | SDK → 초기화 순서, 파일명, CSP·SRI 오류 확인                               |
| SRI 불일치                   | SDK 본체나 프록시가 파일 바이트를 바꿨는지, 위 릴리스와 해시가 맞는지 확인 |
| 두 번 초기화됨               | 공통 레이아웃 중복 include 또는 기존 자동 SDK 시작 제거                    |
| 내 앱 소스가 그대로 보임     | 파일 복사는 SDK 가드 연결 경로입니다. 앱 JS 난독화는 아래 빌드 경로 사용   |

## 선택: 다운로드 대신 CDN 사용

초기화 파일과 JSP include는 내 서버에 두고, 위 첫 번째 SDK 태그의 `src`만 다음 고정 URL로 바꿔도 됩니다. **같은 SRI는 유지**합니다.

```text
https://webguard.uulab.co.kr/cdn/releases/0.3.0-7fffc24439d4935b/webguard.global.js
```

기존 CSP가 있다면 CDN 출처도 허용해야 합니다. 외부 CDN을 사용하지 않는 서비스는 위 직접 복사 방식을 선택하세요. [CDN·파일 연결 상세](START_CDN.ko.md).

## 선택: 내 앱 JavaScript까지 난독화할 때

여기부터는 **개발 PC·CI의 추가 빌드 경로**입니다. Node **22.12 이상**과 npm 또는 호환 패키지 관리자가 필요합니다. 운영 Java 서버에서 Node를 실행하지 않습니다.

아래 방식을 선택하면 직접 복사한 두 태그 대신 **빌드가 출력하는 SDK·초기화·앱 태그 3개**를 사용합니다. 앞의 수동 초기화를 함께 사용하지 마세요. 서버 언어·템플릿 자체는 난독화하지 않습니다.

### 1. 설치

[다운로드 화면](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 **빌드 도구 패키지 `.tgz`**를 받아 적용할 프로젝트 루트에 `uulab-webguard-0.3.0.tgz`로 저장합니다. 그 폴더에서 실행하세요.

```sh
npm install --save-dev ./uulab-webguard-0.3.0.tgz
```

다운로드 대신 화면의 **고정 URL 설치 명령**을 그대로 복사해도 됩니다. npm 게시는 보류 중이므로 `npm install uulab-webguard`로 이 후보가 설치된다고 가정하지 마세요.

### 2. 클라이언트 JS와 JSP 공통 레이아웃 수정

프로젝트 루트에 `webguard-src/` 폴더를 만들고 보호할 앱 JS를 `webguard-src/app.js`로 옮깁니다. SDK 파일은 아래 빌드 파일이 설치된 패키지에서 자동으로 복사합니다.

`webguard-src/init.js`를 새로 만듭니다.

```js
window.webguard = WebGuardSDK.WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
```

JSP 공통 레이아웃에서는 **SDK → init → app** 순서로 외부 스크립트를 불러옵니다. 아래 빌드 후 출력되는 태그 3개를 기존 앱 스크립트 대신 넣으세요. 다른 앱 파일이 있다면 같은 방식으로 추가합니다.

### 3. 빌드·실행

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

### 4. 정상 결과 확인

1. 페이지의 기존 버튼·로그인·API가 이전처럼 동작해야 합니다.
2. Network에서 JS 3개가 `200`, Sources에서는 변환된 JS가 보여야 합니다. 원본 소스맵이 공개되지 않아야 합니다.
3. 콘솔에서 `window.webguard`가 생성되어 있고 SRI·CSP 로딩 오류가 없어야 합니다.
4. 페이지가 전달받은 검사 단축키·우클릭을 제한하는지 확인합니다. 브라우저 메뉴나 이미 열린 개발자도구를 강제로 닫는 기능은 아닙니다.
5. HTML·자산·API·오류 응답의 HTTP 헤더와 비공개 파일의 `404`를 확인합니다.

## 다음 단계

[브라우저 함수 명세](API_BROWSER.ko.md) · [빌드 함수 명세](API_BUILD.ko.md) · [서버 통합](https://github.com/bonjin-app/webguard/blob/main/examples/server-templates/README.md)

### 선택: 저장소의 실행 예제부터 보기

아래는 **패키지 설치 앱이 아닌 WebGuard 저장소 루트**에서만 실행합니다. 저장소를 받은 뒤 Node **22.13 이상**·pnpm **11**로 `pnpm install --frozen-lockfile`을 먼저 실행하세요. 준비 스크립트와 서버 예제 원본은 `.tgz`에 포함되지 않습니다.

이 저장소의 Java 예제 빌드에는 **JDK 17 이상·Maven**, WAR 배포에는 **Tomcat 10.1 계열(Jakarta Servlet 6)**을 사용합니다.

```sh
pnpm build
node scripts/prepare-jsp.mjs
mvn -B -f examples/jsp-servlet/pom.xml package
node scripts/verify-jsp-artifact.mjs
```

생성된 `examples/jsp-servlet/target/webguard.war`를 Tomcat에 배포한 뒤 `/webguard/`에서 **Call Servlet**을 누릅니다. `Servlet: ok, answer 42`가 정상 신호입니다. Maven 검증은 내장 Tomcat을 사용하며 별도 운영 Tomcat 배포 성공을 대신하지 않습니다.

[실행 예제 상세](https://github.com/bonjin-app/webguard/blob/main/examples/jsp-servlet/README.md)에서 하위 경로와 검증 범위를 확인하세요.
