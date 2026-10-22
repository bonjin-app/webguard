# Node 빌드·헤더·무결성·배포 검증 API

이 문서는 현재 소스의 공개 `uulab-webguard/build`, `uulab-webguard/headers`, `uulab-webguard/verify`, `uulab-webguard/server` 진입점을 설명합니다. Node.js 요구 사항은 **22.12.0 이상**입니다. 현재 소스의 기능 명세이며 특정 버전의 npm 게시 완료를 뜻하지 않습니다. [API 색인](API.ko.md) · [브라우저 SDK API](API_BROWSER.ko.md) · [Vite·Next·CLI API](API_INTEGRATIONS.ko.md). 설치는 [설치 가이드](INSTALL.ko.md), 환경별 적용은 [환경 가이드](ENVIRONMENTS.ko.md), 게시 상태는 [릴리스 운영](NPM_RELEASE.md)을 확인하세요.

브라우저에 전달한 JavaScript·HTML·네트워크 응답은 사용자가 관찰할 수 있습니다. 난독화는 암호화가 아니며 클라이언트 감지는 참고 신호입니다. 자격 증명, 권한 검사, 중요한 판정은 서버에서 처리하세요. 스캔·해시·배포 검증의 통과도 비밀 정보 부재나 전체 애플리케이션의 안전성을 증명하지 않습니다.

## 공개 진입점

| import 경로              | 공개 값 export                                                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uulab-webguard/build`   | `protectAppDirectory`, `protectDirectory`, `scanDirectory`, `verifyDeployment`, `createManifest`, `verifyManifest`, `hashContent`, `defineConfig`, `resolveConfig`, `createSecurityHeaders`, `createDomIdentifierGenerator` |
| `uulab-webguard/headers` | `createSecurityHeaders`                                                                                                                                                                                                     |
| `uulab-webguard/verify`  | `checkDeployment`                                                                                                                                                                                                           |
| `uulab-webguard/server`  | `createProtectedServer`                                                                                                                                                                                                     |

`/build`는 빌드 시 Node API입니다. Vite를 import하거나 브라우저 SDK를 현재 Node 프로세스에서 상시 실행하지 않습니다. `protectAppDirectory`의 런타임 옵션 검증 과정에서 임시 SDK 인스턴스를 만들고 즉시 파괴하지만 Node 환경에서 브라우저 관찰이나 네트워크 요청을 시작하지 않습니다.

타입 export는 `/build`의 `DomIdentifierOptions`, `ProtectOptions`, `ProtectAppOptions`, `ProtectionReport`, `Finding`, `IntegrityManifest`, `WebGuardConfigInput`, `WebGuardConfig`, `SecurityHeadersOptions`, `TrustedTypesMode`, `Preset`, `/headers`의 `SecurityHeadersOptions`, `TrustedTypesMode`, `/verify`의 `DeploymentCheck`입니다. 아래 보조 구조 일부는 반환값 설명용이며 해당 이름 자체가 facade에서 별도로 export된다는 뜻은 아닙니다.

## protectAppDirectory

```ts
import { protectAppDirectory } from "uulab-webguard/build";

protectAppDirectory(
  input: string,
  options?: ProtectAppOptions,
): Promise<ProtectionReport>;

interface ProtectAppOptions {
  output?: string;
  privateArtifactsDir?: string;
  config?: WebGuardConfigInput;
  publicBase?: string;
  runtime?: Omit<WebGuardOptions, "preset" | "onThreat"> | false;
  headers?: SecurityHeadersOptions | false;
}
```

## ProtectAppOptions

실제 정적 빌드 출력 디렉터리를 복제하여 보호합니다. TypeScript·JSX 원본 컴파일러나 SSR 서버 번들 변환기가 아닙니다. 기본 `config.preset`은 **`strict`**입니다. 명시한 `basic`, `standard`, `custom`은 유지합니다.

| 옵션                  | 기본값·의미                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input`               | 필수. 현재 작업 디렉터리 기준 상대 경로 또는 절대 경로. 실제 일반 디렉터리여야 하며 루트와 하위 심볼릭 링크를 거부합니다.                                                                                         |
| `output`              | `resolve(input) + "-protected"`. 기존 파일·디렉터리·심볼릭 링크가 있으면 실패하며 덮어쓰지 않습니다.                                                                                                              |
| `privateArtifactsDir` | `output + ".private-maps"`. 이 경로 지정만으로 맵 수집이 활성화되지는 않습니다. `config.sourceMaps.privateArtifacts: true`가 필요합니다.                                                                          |
| `config`              | 아래 `resolveConfig`의 전체 중첩 옵션. 생략한 preset에만 Strict를 적용합니다.                                                                                                                                     |
| `publicBase`          | `/`. SDK·SRI 자산의 배포 기준 경로. `/app/` 또는 `https://host.example/app/` 형태입니다. HTTP(S), 자격 증명·query·fragment 없음, 앞뒤 공백 없음. 끝 `/`를 보완하며 SDK 삽입 URL은 origin을 제외한 pathname입니다. |
| `runtime`             | `{}`. `false`면 SDK 파일 생성과 HTML 삽입을 모두 끕니다. 객체는 아래 런타임 설정을 받습니다. `preset`과 `onThreat`는 거부합니다.                                                                                  |
| `headers`             | `{}`. `createSecurityHeaders()` 정책과 HTML CSP meta를 생성합니다. `false`면 자동 정책 파일 생성·meta 삽입을 하지 않습니다. 기존 별도 정책을 약화하거나 삭제하지 않습니다.                                        |

일반 HTML의 `<head>`에 UTF-8 선언, 자동 CSP meta, 동기식 `assets/webguard-runtime.js` 로딩을 앱 스크립트보다 먼저 배치합니다. CSP meta에서는 HTTP에서만 유효한 `frame-ancestors`를 제외합니다. 중첩 HTML에도 적용됩니다. 자동 SDK의 빌드 preset은 보호 설정에서 가져오고 `devtools.detect`는 별도 `false` 지정이 없으면 `true`입니다. 단축키·컨텍스트 메뉴 제한은 명시적으로 켜야 합니다.

자동 헤더를 사용하면 최종 classic/module 인라인 JS를 난독화하고 실행 위치·script 속성을 유지합니다. importmap과 JSON 데이터는 난독화하지 않습니다. 템플릿 내부 스크립트는 비활성 상태를 유지합니다. 최종 classic/module/importmap의 실제 텍스트 SHA-384를 `script-src`에 추가하고 HTTP 정책과 HTML meta를 동기화합니다. 이 해시 목록은 출력 전체 HTML이 공유하며 임의의 런타임 생성 코드를 변환하지 않습니다. 자동 인라인 CSP 한 헤더의 한도는 **16,384 UTF-8 bytes**입니다.

자동 CSP와 충돌하는 기존 CSP meta, `<base>`, 비 UTF-8 charset, 인라인 style/style 속성, `on*` 이벤트 속성, `javascript:` URL, speculationrules 등은 실패합니다. 정적 HTML에 JSP/PHP 서버 템플릿 구문이 있으면 해당 변환이 활성화된 경로에서 거부합니다. 서버 템플릿 파일 자체를 HTML로 렌더링하지 않습니다. 사용자 정책을 유지할 때는 `headers:false`를 사용하되 인라인 JS 변환과 기존 CSP 해시가 충돌하면 실패합니다. 완전 수동 통합은 `headers:false`, `runtime:false`와 별도 정책·SDK 로딩으로 구성하세요. 기존 CSP가 SDK 삽입보다 먼저 적용될 수 없는 배치도 실패합니다.

입력은 보존합니다. 임시 복제·보호 출력·선택적 비공개 맵을 디스크에 쓰며 네트워크를 사용하지 않습니다. 성공 시 보고서를 반환하고 실패 시 Promise를 reject합니다. 출력·입력·비공개 맵 경로가 서로 겹치거나 포함되면 거부합니다. 기존 `webguard-report.json`, `webguard-manifest.json`, 자동 관리 대상 런타임·헤더 파일과 충돌하면 실패합니다. 비밀 정보 의심, 미지원 파일, SDK 누락, JS 변환 오류도 reject하며 임시 출력을 제거합니다.

```js
import { protectAppDirectory } from "uulab-webguard/build";

const report = await protectAppDirectory("./dist", {
  output: "./dist-protected", // 새 경로여야 함
  publicBase: "/app/",
  config: {
    preset: "strict",
    sourceMaps: { privateArtifacts: true },
    obfuscation: { seed: 42 },
  },
  privateArtifactsDir: "./artifacts/private-maps",
  runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
  headers: { allowedOrigins: { connect: ["https://api.example.com"] } },
});
console.log(report.output, report.files.length);
```

### ProtectAppOptions.runtime

`runtime`은 브라우저 SDK의 직렬화 가능한 설정입니다. 아래 기본값은 필드를 생략했을 때의 **동작 기본값**이며 저장된 옵션 객체가 모든 기본 필드를 채워 반환한다는 뜻은 아닙니다. preset 이름만으로 이 선택 기능들이 활성화되지 않습니다.

| 경로                        | 형식·기본 동작·검증 범위                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `devtools.detect`           | boolean. 이 래퍼에서 기본 `true`. 창 내부/외부 크기 차이 기반 참고 감지.                                                               |
| `devtools.blockShortcuts`   | boolean. 기본 꺼짐.                                                                                                                    |
| `devtools.blockContextMenu` | boolean. 기본 꺼짐.                                                                                                                    |
| `devtools.response`         | `"monitor"                                                                                                                             | "warn"                                                      | "block"`. 미지정 시 경고·차단 없이 관찰. |
| `devtools.shortcutScope`    | `"non-editable"                                                                                                                        | "page"`. 기본 편집 영역 제외. page도 IME 조합은 제외합니다. |
| `devtools.threshold`        | 유한한 양수, 기본 `160` px. 정수만으로 제한하지 않으며 명시적 상한은 없습니다.                                                         |
| `integrity.enabled`         | boolean. 기본 꺼짐. SDK의 명시적 `checkIntegrity()` 호출용이며 빌드 `config.integrity`와 별개입니다.                                   |
| `integrity.timeoutMs`       | safe integer `1..120000`, 기본 `10000` ms.                                                                                             |
| `integrity.maxBytes`        | safe integer `1..67108864`, 기본 `16777216` decoded bytes/리소스.                                                                      |
| `integrity.maxConcurrent`   | safe integer `1..16`, 기본 `4`.                                                                                                        |
| `debugging.enabled`         | boolean. 기본 꺼짐. 가시 페이지 타이머 지연을 관찰합니다.                                                                              |
| `debugging.watch`           | boolean. 기본 꺼짐. 자동 감시는 enabled도 필요합니다.                                                                                  |
| `debugging.intervalMs`      | safe integer `250..60000`, 기본 `1000` ms.                                                                                             |
| `debugging.thresholdMs`     | safe integer `1..60000`, 기본 `1500` ms. 요청 지연을 초과한 추가 지연.                                                                 |
| `debugging.sampleMs`        | safe integer `1..1000`, 기본 `100` ms. 수동 샘플의 요청 지연.                                                                          |
| `debugging.response`        | `"report"                                                                                                                              | "block"`, 기본 비차단 보고.                                 |
| `domIntegrity.enabled`      | boolean. 기본 꺼짐. 정적 DOM 앵커를 비교합니다.                                                                                        |
| `domIntegrity.selectors`    | 조밀한 표준 string 배열, 최대 16개, 각 항목 non-empty·최대 256자. 선택자마다 첫 일치 요소를 사용하며 미지정 시 관찰할 앵커가 없습니다. |
| `domIntegrity.response`     | `"report"                                                                                                                              | "block"`, 기본 비차단 보고.                                 |
| `domIntegrity.maxNodes`     | safe integer `1..4096`, 기본 `1000`, 선택된 하위 트리 전체 합계.                                                                       |
| `domIntegrity.maxBytes`     | safe integer `1..262144`, 기본 `65536`, 직렬화 스냅샷 UTF-8 예산.                                                                      |

알 수 없는 키·getter·부적절한 객체 prototype·범위를 벗어난 값은 옵션 검증에서 거부합니다. 브라우저 개발자 도구 자체를 닫거나 브라우저 소유자의 접근을 확실히 차단하는 기능은 아닙니다. 실시간 callback과 메서드의 전체 계약은 [브라우저 SDK API](API_BROWSER.ko.md)를 참고하고 런타임 생성 후 클라이언트 update API로 연결하세요.

## protectDirectory

```ts
import { protectDirectory } from "uulab-webguard/build";

protectDirectory(
  input: string,
  options?: ProtectOptions,
  context?: { ownedHeaders?: Record<string, string> },
): Promise<ProtectionReport>;

interface ProtectOptions {
  output?: string;
  privateArtifactsDir?: string;
  config?: WebGuardConfigInput;
  publicBase?: string;
  alreadyTransformed?: boolean; // 내부 통합용
}
```

## ProtectOptions

저수준 정적 디렉터리 보호입니다. 기본 preset은 **`standard`**이며 SDK 삽입이나 HTTP 헤더 생성을 자동으로 하지 않습니다. `output`, 비공개 맵 경로, 경로 겹침·기존 출력 보호 규칙은 위와 같습니다. HTML SRI에 사용하는 `publicBase` 기본은 `/`이고 배포 mount 기준이며 보통 `/` 또는 `/app/`을 사용합니다.

`alreadyTransformed`는 **Vite가 이미 변환한 외부 JS 청크를 다시 난독화하지 않도록 하는 내부 플래그**입니다. 보통 사용자 설정에 넣지 마세요. JS source map 참조 제거는 계속 적용되며 이 플래그가 HTML 인라인 스크립트 변환 전체를 끄는 것은 아닙니다. 세 번째 `context.ownedHeaders`도 **자동 소유 CSP를 동기화하는 내부 어댑터 hook**입니다. 임의 정책을 전달하는 end-user 설정이 아닙니다. 일반 앱은 `protectAppDirectory`의 `headers`를 사용하세요. `protectAppDirectory`는 `alreadyTransformed`와 `context`를 사용자 옵션으로 받지 않습니다.

처리는 다음 효과를 갖습니다.

- 선택된 `.js`, `.mjs`, `.cjs`를 난독화하고 JS/CSS의 실제 source map 참조를 제거합니다.
- `.map`과 반복 gzip/Brotli 래핑 맵을 공개 출력에서 제거합니다. 비공개 수집이 켜졌으면 `input-maps/`, 새 외부 JS 맵은 `generated-maps/`, 인라인 맵은 `generated-inline-maps/`에 보관합니다.
- 원본 개발·서버·비공개 파일, 숨김 경로, 백업/편집기 사본 등을 제거합니다. 예: TS/TSX/JSX/Vue/Svelte/JSP/PHP, `src/`, `server/`, `private/`, `node_modules/`, tests/coverage, `.env`, 설정·lock·log 파일. 분류는 대소문자와 압축 접미사도 고려합니다. 배포 제어 `_headers`, `webguard-headers.json`은 소비를 위해 출력에 남기지만 서버의 공개 응답에서는 제외합니다. 루트 `third-party-licenses.md`는 배포 고지 예외입니다.
- **사전 압축된 JS/CSS**(`.js.gz`, `.css.br`, 반복 압축 포함)는 원본 바이트 우회 위험 때문에 제거 후 진행하지 않고 빌드를 실패시킵니다. 압축은 보호가 끝난 최종 바이트에 적용하세요.
- 정적 HTML 인라인 classic/module JS를 독립적으로 변환합니다. importmap·JSON은 유지하며, 서버 템플릿·동적 코드 구문 등 안전하게 처리할 수 없는 입력은 실패합니다. 별도 CSP가 있으면 임의 해시 갱신을 하지 않고 충돌 시 실패합니다.
- `config.integrity.enabled`일 때 HTML의 대응 가능한 로컬 script·stylesheet·modulepreload 자원에 최종 바이트 SRI를 반영합니다. 외부 origin 리소스의 바이트를 다운로드하지 않습니다.
- `webguard-report.json`을 쓰고, `integrity.enabled && integrity.generateManifest`일 때 `webguard-manifest.json`을 씁니다.

입력·출력 단계에서 자격 증명 의심을 발견하면 실패하며 값 대신 경로를 보고합니다. JS 구문/변환 오류, 미종결 CSS 주석, 지원하지 않는 파일 종류·심볼릭 링크, 기존 reserved 출력 파일, 경로 오류는 Promise reject입니다. 새 임시 출력에서 작업한 뒤 결과 디렉터리를 rename하며 기존 목적지는 덮어쓰지 않습니다. 실패하면 임시 출력과 이 호출이 새로 게시한 비공개 맵을 정리합니다. 외부 프로세스가 동시에 파일을 바꾸는 환경을 잠그는 API는 아니므로 신뢰하는 고정 빌드 디렉터리에서 실행하세요. 네트워크 요청은 없습니다.

```js
import { protectDirectory } from "uulab-webguard/build";
await protectDirectory("./static-build", {
  output: "./static-protected",
  config: { preset: "standard", integrity: { generateManifest: true } },
});
```

## ProtectionReport

```ts
interface ProtectionReport {
  version: 1;
  preset: string;
  output: string;
  files: {
    path: string;
    inputBytes: number;
    outputBytes: number;
    transformed: boolean;
    durationMs: number;
  }[];
  removedSources: string[];
  removedMaps: string[];
  findings: Finding[];
  inlineScripts?: {
    path: string;
    index: number;
    kind: string;
    inert: boolean;
    transformed: boolean;
    inputBytes: number;
    outputBytes: number;
    durationMs: number;
  }[];
  privateArtifactsDir?: string;
  limitations: string[];
}
```

`output`와 선택적 `privateArtifactsDir`는 절대 경로입니다. `files[].path`, 제거 목록, Finding의 path는 `/` 구분 상대 경로입니다. `protectAppDirectory`의 files/inputBytes는 HTML 전처리·런타임/헤더 생성 후 복제 입력을 기준으로 하므로 호출자가 준 원래 HTML 바이트 수와 다를 수 있고 생성된 런타임·헤더도 포함합니다. `files`는 복사·변환한 입력 payload 기록이며 나중에 생성한 보고서·manifest 자체의 완전 목록이 아닙니다. `transformed`는 난독화 여부로, map 참조 제거·HTML 직렬화·SRI 추가만으로는 true가 되지 않을 수 있습니다. `durationMs`는 해당 난독화 시간이며 전체 복사·빌드 시간은 아닙니다.

`inlineScripts`는 블록이 있으면 생성됩니다. `index`는 그 HTML에서 외부 `src` 없는 script 목록 기준 **1부터** 시작합니다. `kind`의 실제 값은 `classic`, `module`, `importmap`, `speculationrules`, `data`입니다. 타입은 string입니다. `inert`는 template 내부 등 비활성 컨텍스트 여부이며 true가 실행 활성화를 뜻하지 않습니다. include/exclude에 사용하는 가상 이름은 `파일.html.inline-N.js`지만 보고서의 path는 HTML 파일 경로입니다. `limitations`에는 난독화·클라이언트 검사·비밀 스캔의 한계와 자동 인라인 CSP를 사용하는 경우 공유 허용 목록의 한계가 들어갑니다.

## defineConfig

```ts
import { defineConfig } from "uulab-webguard/build";
defineConfig<const T extends WebGuardConfigInput>(input: T): T;
```

입력 참조를 그대로 반환하는 타입 보존 helper입니다. 복사·정규화·런타임 검증·파일 I/O를 하지 않습니다. 실제 검증은 `resolveConfig()` 또는 보호 API 호출에서 수행합니다.

```js
const config = defineConfig({ preset: "strict", obfuscation: { seed: 42 } });
```

## resolveConfig

```ts
import { resolveConfig } from "uulab-webguard/build";
resolveConfig(input?: WebGuardConfigInput): WebGuardConfig;

type Preset = "basic" | "standard" | "strict" | "custom";
interface WebGuardConfigInput {
  preset?: Preset;
  obfuscation?: Partial<WebGuardConfig["obfuscation"]>;
  sourceMaps?: Partial<WebGuardConfig["sourceMaps"]>;
  integrity?: Partial<WebGuardConfig["integrity"]>;
}
interface WebGuardConfig {
  preset: Preset;
  obfuscation: {
    enabled: boolean;
    level: "basic" | "standard" | "high";
    stringArrayEncoding: "none" | "base64" | "rc4";
    include: string[];
    exclude: string[];
    reservedNames: string[];
    reservedProperties: string[];
    renameProperties: boolean;
    deadCodeInjection: boolean;
    seed: number;
  };
  sourceMaps: { public: false; privateArtifacts: boolean };
  integrity: { enabled: boolean; generateManifest: boolean };
}
```

## WebGuardConfigInput

`resolveConfig`와 보호 함수의 `config` 입력 타입입니다. `preset`, `obfuscation`, `sourceMaps`, `integrity`는 모두 선택적이며 각 중첩 객체는 위 선언처럼 부분 지정합니다. 생략한 값은 preset 기본값으로 채웁니다. `defineConfig`는 이 타입을 보존할 뿐 검증하지 않습니다.

## WebGuardConfig

`resolveConfig`가 반환하는 전체 필수 필드 구조입니다. 위 코드의 `WebGuardConfig` 선언이 정확한 반환 스키마이며 하위 표가 각 필드의 기본값과 제약입니다. 반환 객체와 배열은 호출자 입력·다른 호출 기본값과 공유하지 않습니다.

## Preset

```ts
type Preset = "basic" | "standard" | "strict" | "custom";
```

`custom`은 비어 있는 정책이 아니라 Standard 기반으로 명시 옵션을 조합하는 값입니다. 빌드 기본값은 다음 표와 같습니다.

| preset                   | 기본 난독화 level | 기본 stringArrayEncoding | integrity enabled / generateManifest |
| ------------------------ | ----------------- | ------------------------ | ------------------------------------ |
| `basic`                  | `basic`           | `none`                   | false / false                        |
| `standard` (저수준 기본) | `standard`        | `none`                   | true / true                          |
| `strict` (앱 래퍼 기본)  | `high`            | `rc4`                    | true / true                          |
| `custom`                 | `standard`        | `none`                   | true / true                          |

preset은 기본값을 정하며 명시 옵션을 다시 강제로 덮어쓰지 않습니다. encoding 기본값은 최종 유효 level이 high이면 rc4, 그 외 none입니다. 따라서 `preset:"standard", obfuscation:{level:"high"}`도 기본 rc4입니다.

| 경로                             | 기본값·검증                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `obfuscation.enabled`            | `true`, boolean                                                              |
| `obfuscation.include`            | `["**/*.{js,mjs,cjs}"]`, 원본 소스가 아닌 빌드 출력 상대 경로 glob           |
| `obfuscation.exclude`            | `["**/node_modules/**", "**/*.test.*", "**/*.spec.*"]`                       |
| `obfuscation.reservedNames`      | `[]`, 보존할 식별자 이름의 정규식 문자열 목록                                |
| `obfuscation.reservedProperties` | `[]`, 공개 property 이름의 정규식 문자열 목록                                |
| `obfuscation.renameProperties`   | `false`, true이면 비어 있지 않은 reservedProperties 필요                     |
| `obfuscation.deadCodeInjection`  | `false`, boolean                                                             |
| `obfuscation.seed`               | `0`, `0..Number.MAX_SAFE_INTEGER`의 safe integer                             |
| `sourceMaps.public`              | **false만 허용**, true 등은 거부                                             |
| `sourceMaps.privateArtifacts`    | `false`, boolean                                                             |
| `integrity.enabled`              | 위 preset 표, boolean. SRI와 manifest 단계의 상위 조건                       |
| `integrity.generateManifest`     | 위 preset 표, boolean. enabled가 false이면 true여도 manifest를 생성하지 않음 |

문자열 목록은 빈 배열은 허용하지만 각 원소는 비어 있지 않은 string인 조밀한 배열이어야 합니다. 사용자 getter·상속 numeric slot·별도 필드·사용자 iterator에 의존하는 배열은 거부합니다. reserved 정규식이 잘못되면 `SyntaxError`가 발생할 수 있습니다. basic level은 property rename, dead-code injection, none 이외 string encoding과 조합할 수 없습니다.

기본 난독화는 브라우저 no-eval 대상, 전역 이름 보존, console 제거·debugger trap·self-defending 비활성입니다. High는 제어 흐름 변환·숫자 표현식·문자열 분할 등을 추가하여 크기와 실행 비용이 커질 수 있습니다. 모듈 URL과 번들러 placeholder는 동작 보존을 위해 평문으로 유지될 수 있습니다. 내부 엔진 옵션 전체를 `config`로 전달할 수는 없습니다.

입력은 plain 또는 null-prototype 데이터 객체여야 합니다. 알 수 없는 키·symbol 키·getter·배열 대신 객체·잘못된 enum/boolean/범위는 `TypeError`로 거부합니다. 입력과 기본값을 공유하거나 수정하지 않고 새로운 해석된 객체·목록을 반환합니다. 파일/네트워크 I/O는 없습니다.

```js
const resolved = resolveConfig({ preset: "strict" });
console.log(resolved.obfuscation.level); // high
```

## createSecurityHeaders

```ts
import { createSecurityHeaders } from "uulab-webguard/headers";
// 같은 함수: import { createSecurityHeaders } from "uulab-webguard/build";
createSecurityHeaders(options?: SecurityHeadersOptions): Record<string, string>;

type TrustedTypesMode = "off" | "report-only" | "enforce";
interface SecurityHeadersOptions {
  allowedOrigins?: Partial<Record<
    "script" | "style" | "connect" | "img" | "font" | "worker", string[]
  >>;
  trustedTypes?: TrustedTypesMode;
}
```

## SecurityHeadersOptions

위 `SecurityHeadersOptions`의 `allowedOrigins`와 `trustedTypes`만 입력할 수 있습니다. 임의 헤더 record나 임의 CSP directive를 받지 않습니다.

## TrustedTypesMode

```ts
type TrustedTypesMode = "off" | "report-only" | "enforce";
```

헤더 문자열 record만 반환합니다. 서버·CDN·브라우저에 자동 적용하거나 기존 정책을 변경하지 않으며 I/O가 없습니다. allowedOrigins는 기본 빈 목록, trustedTypes 기본은 `enforce`입니다.

기본 결과의 정확한 정책은 다음과 같습니다.

```http
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
```

`allowedOrigins.script` 등은 해당 `*-src 'self'` 뒤에 정규화·중복 제거한 origin만 추가합니다. origin은 정확한 HTTP(S) DNS 또는 IPv4 host와 선택적 port입니다. 루트 `/` 외 경로, credentials, query, fragment, 공백, wildcard, CSP 토큰, IPv6 literal은 이 생성기에서 허용하지 않습니다. allowlist는 `default-src`, object/base/frame/form 정책을 해제하지 않습니다.

`trustedTypes:"off"`는 Trusted Types 두 directive만 생략합니다. `"report-only"`는 기본 로딩 정책을 강제하는 CSP를 유지하고 Trusted Types가 포함된 전체 정책을 `Content-Security-Policy-Report-Only`로 추가합니다. `report-uri`/`report-to`를 생성하거나 위반 정보를 자동 전송하지 않습니다. `"enforce"`는 script DOM sink에서 Trusted Types를 요구하고 정책 생성을 허용하지 않는 `trusted-types 'none'`입니다. 호환하지 않는 `innerHTML`/문자열 sink를 사용하는 앱은 조정이 필요합니다.

unsafe-inline·unsafe-eval을 추가하는 옵션은 없습니다. 앱 보호 래퍼는 최종 인라인 JS에 대해서만 해시를 추가합니다. 호스트에서 실제 HTTP 헤더로 적용해야 frame-ancestors 등 전체 제약이 유효합니다. 브라우저 개발자 콘솔에 대한 접근 통제는 아닙니다. 잘못된 객체·키·enum·origin·배열·getter는 `TypeError` 또는 URL 파싱 오류로 실패하며 약한 정책으로 fallback하지 않습니다.

```js
const headers = createSecurityHeaders({
  trustedTypes: "report-only",
  allowedOrigins: { connect: ["https://api.example.com"] },
});
```

## createDomIdentifierGenerator

```ts
import { createDomIdentifierGenerator } from "uulab-webguard/build";
interface DomIdentifierOptions { root: string }
createDomIdentifierGenerator(options: DomIdentifierOptions):
  (localName: string, filename: string) => string;
```

## DomIdentifierOptions

```ts
interface DomIdentifierOptions {
  root: string;
}
```

빌드 전용 CSS Modules 이름 생성기입니다. 필수 root는 비어 있지 않은 절대 프로젝트 경로이며 POSIX와 Windows drive 형식을 지원합니다. 기존 경로는 `realpathSync.native`로 정규화하고 존재하지 않는 가상 컴파일러 경로는 문자열 정규화를 사용합니다. 파일을 쓰거나 네트워크를 사용하지 않습니다.

반환 함수의 localName은 `1..4096`자, filename은 `1..32768`자 절대 경로여야 합니다. filename의 `?query`·`#fragment`는 해시 전에 제거합니다. 결과는 `wg_` + SHA-256 hex 앞 **24자**이며 project-relative filename과 localName으로 결정됩니다. 서버와 클라이언트 빌드에 같은 root를 사용하세요. root 외부 파일명도 상대 경로 계산을 거치며 root 포함 검사를 하는 보안 경계는 아닙니다. 원본 이름 사전을 출력하지 않습니다.

잘못된 옵션·추가 root 외 키·상대 경로·이름 길이는 `TypeError`입니다. 전역 CSS selector, DOM id, 렌더링된 DOM 자체를 숨기지 않습니다. 생성된 문자열 자체가 권한 또는 비밀 토큰은 아닙니다.

```js
const name = createDomIdentifierGenerator({ root: process.cwd() });
const cssClass = name("button", `${process.cwd()}/src/Button.module.css`);
console.log(cssClass); // wg_ 뒤 24자리 hex
```

## scanDirectory

```ts
import { scanDirectory } from "uulab-webguard/build";
scanDirectory(directory: string): Promise<Finding[]>;
```

디렉터리를 읽고 정적 휴리스틱 검사 결과를 반환합니다. 파일을 수정하거나 네트워크를 사용하지 않습니다. 일반 파일·디렉터리만 지원하며 심볼릭 링크·특수 파일·읽기 오류는 reject합니다. 숨김/제외 대상 경로도 검사하므로 나중에 제거할 `.env` 등의 자격 증명 의심이 빌드를 중단할 수 있습니다.

JS/CSS/HTML/JSON/TXT/TS/TSX/JSX/Vue/Svelte/ENV 등 텍스트 확장자와 `.env` 경로에서 의심 패턴을 검사합니다. private key, AWS access key, GitHub token, live Stripe key, 길이가 충분한 api-key/secret/password 할당 등의 패턴을 사용하며 원시 값은 Finding 메시지에 포함하지 않습니다. HTML CSP meta 유무·unsafe-inline/eval과 외부 script/stylesheet/modulepreload의 인식 가능한 SRI도 검사합니다. 정적 HTML에서 HTTP CSP의 실제 적용을 확인할 수는 없습니다. 문자열 내부 debug/map 참조도 오탐할 수 있습니다.

## Finding

```ts
interface Finding {
  path: string;
  category:
    | "source-map"
    | "original-source"
    | "mapping-reference"
    | "debug-info"
    | "potential-secret"
    | "security-policy"
    | "integrity-policy";
  severity: "warning" | "error";
  message: string;
}
```

| category            | 현재 severity·의미                                              |
| ------------------- | --------------------------------------------------------------- |
| `source-map`        | error: 공개 `.map` 파일                                         |
| `original-source`   | error: 개발 원본 확장자. `.d.ts`는 이 탐지 항목에서 제외        |
| `mapping-reference` | warning: sourceMappingURL 의심 주석 패턴                        |
| `debug-info`        | warning: console.log/debug/trace 또는 debugger 의심             |
| `potential-secret`  | error: 자격 증명·비공개 설정 의심, 값은 가림                    |
| `security-policy`   | warning: HTML에서 CSP 확인 불가 또는 느슨한 meta 정책           |
| `integrity-policy`  | warning: 외부 script/style/modulepreload의 인식 가능한 SRI 누락 |

스캔 배열에 severity:error가 있다고 `scanDirectory` 자체가 reject하는 것은 아닙니다. 보호 파이프라인은 그중 potential-secret을 명시적으로 차단 조건으로 사용합니다.

```js
const findings = await scanDirectory("./dist");
for (const finding of findings) console.log(finding.path, finding.category);
```

## hashContent

```ts
import { hashContent } from "uulab-webguard/build";
hashContent(content: string | Uint8Array): string;
```

문자열은 UTF-8 바이트로, Uint8Array/Buffer는 실제 바이트로 SHA-384를 계산해 `sha384-<base64>` SRI 문자열을 반환합니다. I/O나 입력 변경은 없습니다. 지원하지 않는 런타임 입력은 Node crypto 오류로 throw할 수 있습니다.

```js
const integrity = hashContent("console.log('example');");
```

## createManifest

```ts
import { createManifest } from "uulab-webguard/build";
createManifest(directory: string): Promise<IntegrityManifest>;
```

디렉터리의 상대 경로를 정렬하여 실제 파일의 SHA-384·바이트 수를 계산합니다. **반환만 하며 JSON 파일을 직접 쓰지 않습니다.** 네트워크를 사용하지 않습니다. 루트는 실제 디렉터리여야 하며 심볼릭 링크·특수 파일·위험 경로·NFC 정규화 후 중복 파일명·읽기 오류는 reject합니다. 최종 파일은 O_NOFOLLOW로 엽니다.

루트의 `webguard-manifest.json`, `webguard-report.json`, `webguard-headers.json`, `_headers` 네 제어 파일만 제외합니다. 같은 이름이 하위 디렉터리에 있으면 일반 payload로 포함합니다. 이 함수는 웹 공개 파일 필터가 아닙니다. 디렉터리에 남긴 다른 private 파일도 해시할 수 있으므로 신뢰하는 최종 공개 payload를 전달하세요.

## IntegrityManifest

```ts
interface IntegrityManifest {
  version: 1;
  algorithm: "sha384";
  files: Record<string, { integrity: string; size: number }>;
}
```

`files` 키는 `/` 구분 상대 경로이며 `size`는 UTF-8 문자 수가 아닌 실제 바이트 수의 음이 아닌 safe integer입니다. integrity는 SHA-384 Base64 digest입니다. 생성기는 null-prototype 파일 record를 사용합니다. 스키마는 추가 루트 필드·entry 필드를 허용하지 않으며 잘못된 SRI, 절대/부모 경로, backslash·제어 문자·colon·위험 property 경로 등을 거부합니다. 서명이나 발급자 인증 정보는 포함하지 않습니다.

```js
import { writeFile } from "node:fs/promises";
const manifest = await createManifest("./dist-protected");
await writeFile("./trusted-manifest.json", JSON.stringify(manifest, null, 2));
```

## verifyManifest

```ts
import { verifyManifest } from "uulab-webguard/build";
verifyManifest(directory: string, manifest: unknown):
  Promise<{ valid: boolean; errors: string[] }>;
```

로컬 신뢰 manifest와 실제 디렉터리를 비교합니다. 누락·추가·바이트 수·SHA-384 변경을 탐지하며 생성기와 동일한 루트 제어 파일 예외를 적용합니다. 쓰기·네트워크는 없습니다. 스키마 오류와 디렉터리를 안전하게 읽을 수 없는 일반 오류는 reject 대신 `{valid:false, errors:[...]}`로 반환합니다. 일치하면 errors는 빈 배열입니다. 파일 스냅샷의 일치 결과로, 악성 코드 여부·manifest의 진정성을 인증하지 않습니다.

```js
const result = await verifyManifest("./dist-protected", manifest);
if (!result.valid) throw new Error(result.errors.join("\n"));
```

## verifyDeployment

```ts
import { verifyDeployment } from "uulab-webguard/build";
verifyDeployment(
  baseUrl: string,
  manifest: IntegrityManifest,
  removedSources?: string[],
  options?: {
    expectedHeaders?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<DeploymentCheck>;
```

파일을 쓰지 않으며 **HTTP(S) GET 네트워크 요청**을 수행합니다. manifest는 원격에서 가져오지 않고 호출자가 전달한 로컬 신뢰 데이터를 사용합니다. baseUrl은 credentials 없는 HTTP(S)이며 pathname 끝 `/`를 보완하고 query·fragment를 제거합니다. removedSources 기본은 `[]`, expectedHeaders 기본은 `{}`, timeoutMs 기본은 `10000`, 범위는 safe integer **`1..120000` ms**입니다. timeout은 응답 스트리밍까지 요청별로 적용하며 전체 작업의 합산 제한이 아닙니다.

첫 fetch 전에 manifest의 모든 자산 경로·size·SRI, 제거 경로, expectedHeaders를 검사합니다. 경로는 빈 세그먼트·`.`·`..`·backslash·`? # : %`·제어 문자를 금지하며 비공개 자산을 공개 manifest로 검증하려 하면 실패합니다. 헤더 이름은 HTTP 문법이어야 하고 대소문자 무시 중복·빈 값·잘못된 값은 거부합니다. 잘못된 로컬 입력은 Promise reject이며 일부 네트워크 요청을 먼저 실행하지 않습니다. 이 함수는 typed manifest 입력을 요구하며 `verifyManifest`의 전체 unknown 스키마 검증을 대신하지 않습니다.

순서대로 다음 요청을 수행합니다.

1. mount 루트 baseUrl의 성공 상태를 확인합니다. manifest에 `index.html`이 있으면 루트 응답 바이트도 그 entry와 비교합니다.
2. manifest 모든 자산의 성공 상태·최종 decoded bytes·size·SHA-384를 비교합니다. 본문이 예상 size를 초과하면 취소하여 무제한 버퍼링하지 않습니다.
3. 코드의 `.bak`, `~`, 사전 압축 사본과 `.map`, removedSources 및 그 압축 변형이 **404 또는 410**인지 확인합니다. 압축 suffix는 `.gz`, `.br`, `.gz.gz`, `.gz.br`, `.br.gz`, `.br.br`입니다. JS 대상 확장자는 js/mjs/cjs, CSS도 코드 probe에 포함합니다.

`expectedHeaders`가 있으면 루트·자산·누락 probe 응답 모두와 비교합니다. 이름 존재만이 아니라 값의 앞뒤 공백 제거·연속 공백 정규화 후 **정확히 동일**해야 합니다. redirect는 따라가지 않으며 요청은 `cache:"no-store"`입니다. HTTP·네트워크·timeout·스트림 오류는 해당 항목 오류를 누적하고 다음 항목을 계속 확인합니다. probe URL의 SPA fallback 200은 성공으로 오인하지 않고 노출/부재 미확인 오류입니다. 자격 증명을 URL에 넣거나 원격 세션 인증을 제공하는 옵션은 없습니다.

## DeploymentCheck

```ts
interface DeploymentCheck {
  valid: boolean;
  errors: string[];
  checked: number;
}
```

`checked`는 시도한 HTTP 요청 수입니다. 요청 실패도 포함하며 로컬 단계에서 중단하면 0입니다. valid는 현재 검사 집합의 errors가 없는지를 나타냅니다. 배포·설정 변경을 수행하거나 CI·프로덕션 전체의 안전성을 인증하지 않습니다.

```js
const result = await verifyDeployment(
  "https://site.example.com/app/",
  manifest,
  ["src/main.ts", "assets/app.js.map"],
  { expectedHeaders: createSecurityHeaders(), timeoutMs: 15000 },
);
console.log(result.valid, result.checked, result.errors);
```

앱 빌드가 인라인 해시를 추가했다면 새로 생성한 빈 헤더 정책 대신 **실제 최종 `webguard-headers.json`**을 expectedHeaders로 읽어 전달해야 일치합니다. 보통 아래 `checkDeployment`가 이 절차를 처리합니다.

## checkDeployment

```ts
import { checkDeployment } from "uulab-webguard/verify";
checkDeployment(directory: string, baseUrl: string): Promise<DeploymentCheck>;
```

보호 출력 디렉터리의 로컬 신뢰 데이터를 먼저 검증하고 원격을 비교하는 상위 API입니다. 디스크에서 `webguard-manifest.json`을 읽고 `verifyManifest`로 전체 로컬 payload를 확인합니다. 이어 필수 `webguard-headers.json`에서 CSP와 `X-Content-Type-Options: nosniff`, 유효·중복 없는 string 헤더를 검사합니다. 헤더·metadata는 일반 파일인지 확인하며 최종 파일 심볼릭 링크를 따라 읽지 않습니다.

`webguard-report.json`은 없어도 됩니다. 있으면 `removedSources`와 `removedMaps`가 안전한 상대 경로 string 배열이어야 합니다. 보고서·헤더·`_headers` 제어 URL과 제거 파일을 원격 부재 probe에 추가합니다. URL을 검증한 뒤 `verifyDeployment`에 실제 최종 헤더 정책을 전달합니다. 별도 timeout 옵션이 없으므로 요청당 기본 10000 ms입니다.

로컬 파일 누락·손상·hash mismatch·정책 오류·보고서 오류·잘못된 URL은 `{valid:false,errors:[...],checked:0}`이며 이 단계에서는 네트워크를 요청하지 않습니다. 유효한 경우 원격 네트워크와 본문 검증을 수행하며 그 실패도 결과로 반환합니다. 디스크와 배포를 수정하지 않습니다. 외부 제공 manifest를 그대로 신뢰하는 API가 아닙니다.

```js
const result = await checkDeployment(
  "./dist-protected",
  "https://site.example.com/app/",
);
if (!result.valid) {
  console.error(result.errors);
  process.exitCode = 1;
}
```

## createProtectedServer

```ts
import type { Server } from "node:http";
import { createProtectedServer } from "uulab-webguard/server";
createProtectedServer(directory: string): Promise<Server>;
```

신뢰하는 불변 빌드 디렉터리의 정적 HTTP 서버를 만들되 **listen하지 않은 `node:http.Server`**를 반환합니다. 호출자가 host·port·listen·close를 관리합니다. 시작 시 디렉터리를 canonicalize하고 `webguard-headers.json`을 읽습니다. policy 파일의 실제 경로가 root 안에 있어야 하며 CSP 필수, 헤더 값은 비어 있지 않은 string이어야 합니다. 대소문자 중복 이름과 HTTP framing 제어(`connection`, `transfer-encoding`, `content-length`, `trailer`, `upgrade`)를 거부합니다. nosniff는 강제로 적용합니다. 잘못된 경로·디렉터리·JSON·헤더 정책은 Promise reject입니다.

반환된 서버는 요청 때 파일을 읽으며 디스크를 수정하지 않습니다. 생성 호출 자체는 외부 네트워크를 요청하거나 port를 열지 않습니다. listen 후 GET/HEAD만 지원하며 다른 method는 `405`, `Allow: GET, HEAD`입니다. HEAD는 GET과 같은 길이·정책 헤더를 보내고 body를 생략합니다. malformed URL은 400, 미존재·private·경로 이탈 등은 404입니다. 정상 일반 파일은 200, 실제 공개 index.html이 있는 디렉터리는 끝 `/`로 308 redirect하며 query를 유지합니다. SPA history fallback은 없습니다.

요청 경로와 realpath 결과를 모두 검사하여 root 외부 심볼릭 링크와 숨김·개발·서버·맵·백업·사전 압축 코드·로컬 제어 파일을 차단합니다. root 안의 공개 파일로 향하는 허용 가능한 symlink는 일률 거부하는 빌드 API와 달리 resolve 후 검사할 수 있습니다. 다운로드를 위한 파일 목록 endpoint는 없습니다. `webguard-manifest.json`은 공개 가능하고 보고서·헤더 JSON·`_headers`는 비공개입니다.

MIME은 html/js/mjs/cjs/css/json/svg/png/jpg/jpeg/gif/webp/avif/ico/woff/woff2/wasm/txt/md를 구분하며 나머지는 application/octet-stream입니다. JS는 `text/javascript; charset=utf-8`, HTML은 `text/html; charset=utf-8`입니다. private 판정은 MIME보다 우선합니다. 정책 헤더는 정상·오류 응답에도 적용하며 시작 시 읽은 정책은 자동 재로드하지 않습니다. TLS·인증·rate limit·압축·프로덕션 배포를 구성하는 API는 아닙니다. 제공할 빌드는 별도로 무결성 검증하고 변경하지 마세요.

```js
const server = await createProtectedServer("./dist-protected");
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(4173, "127.0.0.1", resolve);
});
// 종료 시 server.close();
```

## 검증 근거와 적용 범위

이 명세는 public facade의 export와 `core/security`, `cli/application`, `cli/pipeline`, `cli/html`, `cli/scan`, `cli/remote`, `cli/check`, `cli/dom-identifiers`, `integrity`, `vite-plugin/static-server`의 구현을 기준으로 작성했습니다. 기본값·범위·실패 경계는 core/security/integrity/DOM naming 단위 테스트와 application/inline-output/remote/deployment-check/security-server 통합 테스트의 계약을 함께 확인했습니다. 문서 작성만으로 새 npm 게시, 실제 외부 배포, 모든 호스트의 header 적용 또는 물리 기기 동작을 확인한 것은 아닙니다.
