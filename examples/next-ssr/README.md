# Next.js SSR 예제

브라우저로 보내는 프로덕션 JavaScript를 난독화하고 SDK를 자동 시작합니다. React 소스에 별도 초기화 컴포넌트를 추가하지 않습니다. 서버 컴파일, RSC, API, Edge 코드와 개발 모드는 변환하지 않습니다.

이 체크아웃 예제는 로컬 `packages/npm` 패키지를 사용합니다. 먼저 저장소 루트에서 의존성과 공개 패키지 빌드를 준비한 뒤 예제 폴더에서 실행하세요.

```sh
# 저장소 루트
pnpm install --frozen-lockfile
pnpm build
cd examples/next-ssr
npm install
npm run build
npm start
```

`next.config.mjs`에서 `withWebGuard(nextConfig, options)`로 기존 설정을 감쌉니다. Next.js 16 기본 Turbopack은 지원하지 않으므로 **`next build --webpack`**이 필요합니다. 이 예제는 Next.js 16.4.2 / React 19.3.1로 고정합니다.

인식 가능한 Next 프로덕션 CLI에서는 `--webpack` 누락과 명시적 `--turbopack`/`--turbo`를 설정 단계에서 거부합니다. 프로그램 방식 빌드나 다른 런처에서 Webpack 훅을 건너뛰는 실행 방식은 검증 범위에 포함되지 않습니다. `turbopack:{}` 설정이 있어도 위 빌드 명령을 유지해야 합니다.

기본 `preset`은 `strict`, SDK 자동 시작은 활성화됩니다. 단축키·컨텍스트 메뉴 제한은 위 예제처럼 명시적으로 켭니다. `runtime:false`는 SDK 자동 시작만 끕니다. 서버 보안 헤더·CSP는 앱/호스트에서 관리하며 기존 정책을 완화하거나 덮어쓰지 않습니다. Next의 HTML/Flight 데이터와 사용자에게 보낸 값은 숨겨지지 않습니다. `public/`에 직접 둔 스크립트는 Webpack 대상이 아니므로 별도 보호가 필요합니다.

프레임워크 전체에 High 난독화를 적용하면 빌드 크기가 크게 늘 수 있습니다. 기본 `frameworkPreset:"standard"`는 실제 Webpack 청크의 모든 모듈 출처가 외부 의존성으로 확인될 때만 Standard로 보호합니다. 앱 코드·WebGuard SDK·혼합 청크·출처가 불명확한 청크는 요청한 `preset`을 유지합니다. `basic` 요청을 Standard로 올리지 않습니다. 모든 청크에 요청 강도를 그대로 적용하려면 `frameworkPreset:"inherit"`를 명시하세요. 모든 브라우저 JS는 두 경우 모두 난독화하며, 빌드 로그에는 실제 적용 강도와 변환 전후 비압축 바이트를 기록합니다. 네트워크 전송량·실행 성능은 프로젝트에서 별도 측정해야 합니다.

이 예제의 `proxy.js`는 앱이 직접 관리하는 요청별 nonce CSP입니다. 프로덕션에서는 `unsafe-inline`, `unsafe-eval` 없이 SSR과 hydration을 검사합니다. nonce는 동적 렌더링을 필요로 하므로 이 예제는 `force-dynamic`을 명시합니다. 정적 생성·ISR·PPR 프로젝트에 그대로 복사하지 말고 [Next 공식 CSP 문서](https://nextjs.org/docs/app/guides/content-security-policy)에 맞춰 정책을 정하세요.

설정 함수나 비동기 설정 함수라면 반환 전에 `withWebGuard`를 호출하세요. 기존 동기 `webpack` 훅은 먼저 실행되고 결과를 보존합니다. Next 자체가 기다리지 않는 비동기 `webpack` 훅은 명확한 오류로 거부합니다. 비동기 작업은 비동기 `next.config` 함수에서 수행하세요. 브라우저 소스맵 공개 옵션은 거부됩니다. 지원하지 않는 클라이언트 엔트리 형태 또는 뒤늦게 생성된 미보호 청크는 빌드를 실패시킵니다.

자동 검증: 저장소 루트에서 `node scripts/verify-next-consumer.mjs --tarball /절대/패키지.tgz --evidence docs/evidence/next-consumer-verification.json`. 임시 설치한 실제 npm 압축 패키지로 프로덕션 서버를 실행해 SSR, hydration, 상태 변경, 클라이언트 이동, 동적 import, SDK, 소스맵과 브라우저 청크를 Chromium/Firefox/WebKit에서 검사합니다. 이 명령은 npm 게시를 하지 않습니다.
