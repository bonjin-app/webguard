# Next.js에 WebGuard 적용하기

기존 **Next.js App Router + Webpack 운영 빌드**에 연결합니다. 브라우저 청크의 난독화와 SDK 시작을 적용하고 SSR·RSC·Route Handler는 유지합니다.

[환경 다시 선택](https://webguard.uulab.co.kr/docs/#install) · [연동 API](API_INTEGRATIONS.ko.md#withwebguard)

## 준비 사항

- Node.js 22.12 이상. pnpm 11은 Node.js 22.13 이상이 필요합니다.
- 기존 Next 앱의 `package.json`, `next.config.mjs` 또는 `next.config.ts`를 확인합니다.
- 이 어댑터는 Webpack용입니다. **Turbopack 빌드에는 적용되지 않습니다.**

## 1. 패키지 설치

[설치 명령 복사](https://webguard.uulab.co.kr/docs/#sdk-downloads)에서 npm·pnpm 고정 URL 명령을 앱 폴더에서 실행합니다. npm 게시는 보류 중입니다.

파일로 받은 패키지를 앱 폴더에 저장했다면 다음을 사용합니다.

```sh
npm install -D ./uulab-webguard-0.3.0.tgz
```

## 2. Next 설정과 빌드 명령 수정

**수정할 파일: `next.config.mjs`**. 기존 설정 객체를 `withWebGuard`로 감쌉니다.

```js
import { withWebGuard } from "uulab-webguard/next";

const nextConfig = {
  reactStrictMode: true,
  // 기존 Next 설정을 유지합니다.
};

export default withWebGuard(nextConfig, {
  preset: "strict",
  runtime: {
    devtools: { blockShortcuts: true, blockContextMenu: true },
  },
});
```

**수정할 파일: `package.json`의 scripts.** 다른 스크립트는 유지합니다.

```json
{
  "scripts": {
    "build": "next build --webpack",
    "start": "next start"
  }
}
```

## 3. 빌드·실행

```sh
npm run build
npm start
```

기본 설정이라면 `http://localhost:3000`을 엽니다. SDK를 서버 요청마다 초기화하거나 클라이언트에서 중복 초기화하지 않습니다.

## 4. 정상 결과 확인

- 운영 클라이언트 청크가 변환되고 공개 JavaScript 소스맵을 내보내는 설정은 충돌 오류로 안내됩니다.
- SSR 첫 화면, hydration 이후 버튼·폼, 페이지 이동과 동적 import가 모두 동작해야 합니다.
- 서버 API는 기존대로 동작해야 합니다. 서버 코드를 난독화하는 연결이 아닙니다.
- `public/`에 직접 둔 JS와 인라인 Flight 데이터는 자동 변환 대상이 아닙니다.

**`.next` 전체를 `protect-app`이나 `doctor`에 넣지 마세요.** 정적 HTML용 진단·서버와 Next 서버 출력은 다릅니다.

## 문제 해결

| 증상                       | 먼저 확인할 것                                           |
| -------------------------- | -------------------------------------------------------- |
| 변환이 적용되지 않음       | `next build --webpack` 사용 여부와 운영 빌드인지 확인    |
| hydration·스타일 오류      | 원래 Next 설정과 CSP/nonce 계약을 유지했는지 확인        |
| 서버 전체 후처리 오류      | `.next` 후처리를 제거하고 전용 어댑터만 사용             |
| `public/` JS가 그대로 보임 | 앱 소스에서 import하거나 자산 전용 보호 단계를 별도 구성 |

## 다음 단계

운영에는 기존 Next 배포 방식을 유지합니다. 이 어댑터는 **CSP·SRI·HTTP 헤더를 자동 생성하지 않습니다.** 요청별 nonce와 기존 정책을 적용한 상태에서 SSR·페이지 이동을 확인하세요. 고정 nonce나 무조건적인 `unsafe-inline` 추가로 해결하지 마세요.

[실행 가능한 Next 예제](https://github.com/bonjin-app/webguard/blob/main/examples/next-ssr/README.md) · [상세 지원 경계](ENVIRONMENTS.ko.md#react와-nextjs-ssr)
