# uulab-webguard

개발자의 웹 앱에 설치하는 보호 SDK와 빌드 도구 통합 패키지입니다. 웹사이트는 SDK 동작과 보호 전후를 확인하는 데모이며, 운영 앱의 보호는 설치한 패키지와 배포 설정에서 수행합니다.

Vite 설정 또는 기존 빌드 후처리 한 번으로 Strict/High 난독화·RC4 문자열 인코딩, 자동 SDK 시작, SRI·공개 소스맵 제거와 브라우저 정책을 연결합니다. Node.js 22.12 이상이 필요합니다. Vite 통합은 Vite 7/8의 ESM 웹 앱용이며 범용 `/build` API·CLI는 Vite 설치를 요구하지 않습니다.

[데모 체험](https://webguard.uulab.co.kr/demo) · [한국어 전체 가이드](INSTALL.ko.md) · [온라인 가이드](https://webguard.uulab.co.kr/docs/#install)

**0.3.0은 아직 npm에 게시하지 않은 로컬 후보입니다. 현재 공개 버전은 0.2.0입니다.** 이 문서의 새 동작은 후보 기준이며 공개 0.2.0의 동작과 구분하세요. 검토한 로컬 `.tgz`가 있다면 시험 앱에서 `npm install -D /absolute/path/to/uulab-webguard-0.3.0.tgz`로 설치할 수 있습니다.

```sh
# 0.3.0 배포 후에만 실행 — 현재 레지스트리에는 없음
npm install -D uulab-webguard@0.3.0
```

## 한 번 연결하는 후처리

```js
// scripts/protect.mjs — Node에서 실행
import { protectAppDirectory } from "uulab-webguard/build";

await protectAppDirectory("dist", {
  output: "dist-protected",
  config: { preset: "strict" },
  runtime: { devtools: { blockShortcuts: true, blockContextMenu: true } },
  headers: { trustedTypes: "report-only" },
});
```

기존 빌드 명령 다음에 `node scripts/protect.mjs`를 실행하고 `dist-protected`만 배포합니다. `/build` 진입점은 Vite 설치를 요구하지 않습니다. 목적지가 이미 있으면 실패하므로 빌드별 새 출력 경로를 쓰거나 이전 결과를 보관하세요. 실패한 실행이 기존 출력과 원본 입력을 덮어쓰지 않습니다.

범용 후처리는 빌드 도구가 만든 파일명을 유지합니다. 파일명의 `[contenthash]`는 보호 전 바이트를 가리킬 수 있으며, 난독화 시드나 엔진 버전이 바뀌면 같은 파일명에 다른 보호 코드가 생길 수 있습니다. 같은 자산 URL에 장기 `immutable` 캐시를 적용하지 마세요. 릴리스별 배포 경로를 사용하거나 재검증·`no-store` 정책을 적용하고, 최종 해시 이름이 필요하면 빌드 파이프라인에서 참조·매니페스트까지 함께 갱신해야 합니다.

CLI도 제공합니다.

```sh
npx --no-install webguard protect-app dist --output dist-protected --preset strict --restrict-shortcuts --restrict-context-menu --trusted-types report-only
npx --no-install webguard-serve dist-protected --port 4173
npx --no-install webguard-check dist-protected --url http://127.0.0.1:4173/
```

기본은 Strict이며 입력 제한은 별도로 켜야 합니다. `--no-runtime`은 자동 SDK만, `--no-headers`는 정책 생성만 끕니다. `webguard protect`·`protectDirectory()`는 SDK·정책 자동 통합을 하지 않는 빌드 보호 경로입니다.

### Vite 설정

```ts
// vite.config.ts — 기존 플러그인·설정은 유지하세요.
import { defineConfig } from "vite";
import { webguardApp } from "uulab-webguard";

export default defineConfig({ plugins: [webguardApp()] });
```

위 자동 통합을 쓰면 SDK를 따로 설치하거나 앱에서 초기화하지 않습니다. 0.3.0은 앱 리소스보다 앞에 CSP 메타 정책도 넣어, 호스트 헤더가 없어도 기본 `connect-src 'self'`와 지원 브라우저의 Trusted Types 강제를 적용합니다. `frame-ancestors`, report-only와 MIME 보호는 실제 HTTP 헤더가 필요합니다. Trusted Types 미지원 환경은 보호된 것으로 판단하지 마세요. 개발/HMR에는 적용하지 않습니다.

```sh
npm run build && npx webguard-serve dist --port 4173
```

`http://127.0.0.1:4173`에서 확인하세요. 보호 서버는 생성된 HTTP 정책을 적용하고 소스맵·보고서·서버 제어 파일 등 비공개 경로를 숨깁니다. 기본 CLI는 루프백 검증용이며 없는 경로는 404입니다. 같은 플러그인이 Vite preview에도 별도 설정 없이 헤더·비공개 경로 제한을 적용합니다. 정적 호스트·CDN에서도 `_headers` 지원 여부와 비공개 파일 거부 규칙을 각각 적용해야 합니다.

```ts
webguardApp({
  headers: {
    allowedOrigins: { connect: ["https://api.example.com"] },
    trustedTypes: "report-only",
  },
  runtime: {
    devtools: { blockShortcuts: true, blockContextMenu: true },
  },
});
```

외부 API는 정확한 출처만 허용합니다. Trusted Types는 기본 `enforce`이며 `report-only`·`off`로 조정할 수 있습니다. report-only는 HTTP 헤더를 호스트에 반영해야 동작합니다. `headers: false`는 자동 CSP 메타·헤더 생성과 preview 정책 처리를 끕니다. 입력 제한은 기본 꺼짐이며 선택적으로 켭니다. 이 제한은 개발자도구 창 자체를 잠그지 않습니다.

제한 대상은 F12, Windows `Ctrl+Shift+I/J/C`, Mac `Cmd+Option+I/J/C`입니다. Mac Option 키나 키보드 배열 때문에 문자값이 바뀌어도 물리 키 코드 `KeyI/J/C`를 함께 확인합니다. 켠 상태에서 일반 본문을 클릭하고 시험하세요. 편집 필드는 제한에서 제외하며, 브라우저가 페이지에 전달하지 않는 예약 단축키는 SDK가 통제하지 못합니다.

| 구분                   | 후보에서 적용되는 범위                                        | 별도 책임·제한                         |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------- |
| 자동 HTML 정책         | 초기 CSP 메타로 스크립트·네트워크·지원되는 Trusted Types 강제 | HTTP 전용 정책·비공개 파일 숨김 불가   |
| HTTP 보호 서버·preview | 실제 응답 헤더와 비공개 파일 거부                             | 정적 호스트는 자체 규칙 반영 필요      |
| SDK                    | 자동 시작, 선택적 F12·우클릭 제한, 추정 신호                  | 제한은 기본 꺼짐, 개발자도구 잠금 불가 |
| 앱 서버                | 가격·입력·권한 검증을 직접 구현                               | SDK 자동 기능이 아님                   |

Trusted Types 미지원은 성공으로 세지 않습니다. 데모의 의도된 CSP/TypeError·HTTP 409는 결과와 함께 확인하세요. 일반 앱의 404·5xx·처리되지 않은 예외나 기준 요청 실패를 보호 성공으로 분류하지 마세요.

실시간 변경은 브라우저 코드에서 수행합니다. 새로고침하면 빌드 설정으로 돌아갑니다.

```ts
import { getWebGuard } from "uulab-webguard/client";
getWebGuard()?.update({ devtools: { blockShortcuts: false } });
```

### 환경별 적용 범위

Webpack·esbuild·일반 HTML은 기존 빌드 뒤에 범용 후처리를 연결합니다. PHP·JSP·ASP.NET은 서버 템플릿 대신 정적 자산만 보호하고 외부 SDK와 서버 헤더를 직접 연결합니다. Next.js·Nuxt·Angular의 정적 출력은 프레임워크별 호환성 검토가 필요하며 네이티브 SSR·nonce·hydration 자동 통합은 제공한다고 주장하지 않습니다. 자체 서비스 워커·해시·프리캐시·서명 매니페스트는 최종 보호 바이트로 갱신해야 합니다.

정적 HTML의 인라인 스크립트·이벤트 속성은 외부화하세요. 기존 CSP가 있으면 정책 소유자를 정하고 충돌을 해결해야 합니다. Trusted Types 관찰 모드도 CSP의 인라인 실행 제한을 풀지 않습니다. 서버별 레시피와 실제 브라우저 검증 범위는 저장소의 `docs/ENVIRONMENTS.ko.md`를 참고하세요. 서버 레시피 제공은 실제 PHP·ASP.NET·Nginx 서버 실행 검증을 뜻하지 않습니다.

범용 자동 통합의 인스턴스는 `WebGuardSDK.getAutoGuard()`로 조회합니다. 독립 `/browser.global.js` 파일은 로드만으로 시작되지 않으므로 외부 초기화 파일에서 `WebGuardSDK.WebGuard.init()`을 호출하세요. 자동 SDK와 수동 초기화를 중복하지 마세요.

### SDK 직접 연결

Vite 자동 통합을 쓰면 위 `/client`로 기존 인스턴스를 조회하세요. 자동 SDK 없이 직접 수명 주기를 관리할 때만 `/browser`를 사용하며, 중복 초기화하지 않습니다.

```ts
import { WebGuard } from "uulab-webguard/browser";

const guard = WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
  onThreat: (event) => console.info("[WebGuard]", event.type),
});

// 이 페이지에 즉시 적용합니다. 새로고침 후에는 초기 설정으로 돌아갑니다.
guard.update({ devtools: { blockShortcuts: false } });
```

앱 종료·기능 해제 시 `guard.destroy()`를 호출하면 이벤트 리스너와 진행 중인 명시적 파일 검사를 정리합니다. 해제한 인스턴스에 `update()`를 호출해도 다시 시작하지 않습니다. `getOptions()`는 현재 옵션의 분리된 스냅샷을 반환합니다.

직접 연결한 브라우저 SDK는 빌드 난독화·SRI·CSP·HTTP 헤더를 자동 생성하지 않습니다. 난독화와 자동 연결이 필요하면 `webguardApp()` 또는 `protectAppDirectory()`를 사용하세요. `checkIntegrity(url, expected)`는 `integrity: { enabled: true }`로 허용한 뒤 직접 호출하며, 신뢰할 수 있는 배포에서 얻은 `sha384-…` 기준값이 필요합니다. 사이트 전체 자동 검사나 서버 권한 검증 기능이 아닙니다.

Node 서버 API도 제공합니다. 브라우저 번들에 가져오지 마세요.

```js
import { createProtectedServer } from "uulab-webguard/server";
const server = await createProtectedServer("dist");
server.listen(4173, "127.0.0.1");
```

실제 배포에 사용한 로컬 출력으로 응답을 검사하세요. 실패 시 JSON 오류와 종료 코드 1을 반환합니다.

```sh
npx --no-install webguard-check dist --url http://127.0.0.1:4173/
npx --no-install webguard-check dist --url https://YOUR-SITE.example/
```

- `uulab-webguard`: Vite `webguardApp()` / 빌드 전용 `webguard()`
- `/build`: Vite와 독립적인 `protectAppDirectory()`·`protectDirectory()`·정책/무결성 API
- `/browser.global.js`: 번들러 없는 페이지용 `WebGuardSDK.WebGuard` (명시적 초기화 필요)
- `/client`: Vite 자동 SDK 조회·실시간 변경
- `/browser`: 수동 SDK 사용
- `/headers`: 서버 정책 생성
- `/server`: Node 보호 서버 `createProtectedServer(directory)`
- `/verify`: Node 배포 검사 `checkDeployment(directory, baseUrl)`

Vite preview의 명시적인 `preview.proxy` 경로는 백엔드가 응답 헤더·인증·비공개 자료를 보호해야 합니다. 좁은 API prefix를 사용하세요. `proxy.bypass`는 정적 파일 보호 우회를 막기 위해 지원하지 않으며 시작 전 오류로 표시합니다.

난독화와 RC4 문자열 인코딩은 전달된 HTML·CSS·JavaScript나 네트워크 요청을 숨기지 않습니다. 브라우저 메뉴·콘솔·이미 열린 개발자도구는 통제하지 못합니다. 비밀키·가격 재계산·권한 검증은 서버에 두세요. 서버 검증은 SDK의 자동 기능이 아닙니다. 원격 수집·무한 디버거 루프를 추가하지 않습니다.

MIT · 난독화 엔진 javascript-obfuscator의 BSD-2-Clause 고지 포함.
