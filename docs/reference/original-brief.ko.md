아래는 Codex에 그대로 전달할 수 있는 WebGuard 프로젝트 개발 지시서야.

프로젝트 임시명은 `webguard`로 정하고, 공식 브랜드명은 추후 변경할 수 있도록 설계했어. JSP, JavaScript, TypeScript, React 등 범용 웹 환경을 지원하며, F12 개발자 도구 접근 방해 + JavaScript 고강도 난독화 + 원본 소스 보호 + 코드 변조 탐지를 핵심으로 구성했어.

개발 순서는 공통 엔진 → 브라우저 SDK → 빌드 플러그인 → 테스트 및 문서화로 잡고, 자체 서버 없이 사용할 수 있는 오픈소스 패키지를 우선 완성하도록 했어.

# WebGuard — 오픈소스 웹 브라우저 보호 솔루션 개발 지시서

## 0. Codex 작업 지시

프로젝트 임시명은 **webguard**다.

JSP, JavaScript, TypeScript, React, Vue, Next.js 등 다양한 웹 기술에서 사용할 수 있는 오픈소스 프론트엔드 보호 솔루션을 개발한다.

단순히 F12 키를 막는 라이브러리가 아니라, **프로덕션 소스 보호, JavaScript 난독화, 개발자 도구 접근 방해, 코드 변조 탐지, 브라우저 보안 정책 적용**을 하나의 패키지로 제공하는 것이 목표다.

별도의 유료 서비스나 자체 서버를 요구하지 않는 구조를 우선한다.

공식 솔루션명은 나중에 변경할 수 있으므로 외부 노출 브랜드명과 내부 패키지 식별자를 분리한다.

**중요:** 설계 문서만 작성하지 말고 실제로 실행 가능한 코드, 테스트, 예제, CLI, README까지 구현한다. 각 개발 단계에서 빌드 및 테스트를 통과시킨다.

---

## 1. 핵심 원칙

브라우저는 사용자가 제어하는 실행 환경이다.

따라서 다음과 같은 보안 한계를 인정해야 한다.

- 개발자 도구를 완전히 비활성화할 수 없다.
- 브라우저에 전송된 HTML, CSS, JavaScript를 절대적으로 숨길 수 없다.
- 사용자의 로컬 코드 수정을 원천적으로 막을 수 없다.
- JavaScript 난독화는 암호학적인 비밀 보호가 아니다.
- 클라이언트 측 탐지 결과만으로 보안 권한을 결정하면 안 된다.

WebGuard는 **분석 난이도 증가, 원본 소스 노출 최소화, 배포 리소스 무결성 강화, 의심스러운 변조 신호 탐지**를 제공한다.

인증·인가·결제·라이선스 등 중요한 검증은 서버에서 처리하도록 안내한다.

---

## 2. 지원 환경

### 웹 기술

| 환경            | 지원 방법                   |
| ------------- | ----------------------- |
| HTML          | 브라우저 SDK                |
| JavaScript    | SDK 및 CLI               |
| TypeScript    | 타입 지원 및 빌드 플러그인         |
| JSP / Servlet | 정적 리소스 SDK 및 빌드 통합      |
| jQuery        | 브라우저 SDK                |
| React         | Vite/Webpack 및 React 통합 |
| Next.js       | 클라이언트 빌드 통합             |
| Vue / Nuxt    | 빌드 플러그인                 |
| Angular       | 빌드 파이프라인 연동             |
| Svelte        | Vite 플러그인               |
| PHP / Laravel | JavaScript 리소스 보호       |
| ASP.NET       | JavaScript 리소스 보호       |

초기에는 브라우저 SDK, CLI, Vite 플러그인을 완성하고 나머지는 어댑터 방식으로 확장한다.

JSP 파일과 Java 서버 코드는 서버에서 실행되므로 클라이언트 난독화 대상에 포함하지 않는다.

### 브라우저

- Chrome
- Edge
- Firefox
- Safari
- Android Chrome
- iOS Safari

기능 지원 여부는 브라우저별로 구분하고 지원되지 않는 기능은 안전하게 비활성화한다.

---

## 3. 필수 기능

### WG-001. 개발자 도구 접근 방해

선택적으로 다음 기능을 지원한다.

- F12 입력 가로채기
- Ctrl+Shift+I
- Ctrl+Shift+J
- Ctrl+Shift+C
- macOS 대응 단축키
- 우클릭 컨텍스트 메뉴 제한
- 브라우저 개발자 도구 탐지 휴리스틱
- 탐지 이벤트 콜백
- 경고 메시지 표시
- 기능별 개별 활성화

단축키 차단은 브라우저가 허용하는 범위에서만 작동한다.

브라우저 자체 개발자 도구 메뉴는 차단할 수 없으며, 탐지 결과에는 오탐이 존재할 수 있다.

기본 동작은 `monitor` 또는 `warn`으로 설정한다.

무한 디버거 루프, 브라우저 프리징, CPU 과다 사용, 지속적인 페이지 새로고침 방식은 구현하지 않는다.

키보드 접근성과 정상 사용자 경험을 해치지 않도록 단축키 차단은 명시적으로 활성화한 경우에만 적용한다.

### WG-002. 고강도 JavaScript 난독화

프로덕션 빌드 과정에서 난독화를 적용한다.

필요 기능:

- Identifier Renaming
- String Transformation
- String Array Encoding
- Control Flow Transformation
- Dead Code Injection (선택)
- Property Name Transformation (안전한 대상만)
- Code Minification
- Comment Removal
- Reserved Identifier 설정
- 난독화 대상 파일 선택
- 특정 파일·라이브러리 제외
- 난독화 강도별 프리셋

난독화 강도는 다음 세 단계로 지원한다.

- `basic`: 압축 및 식별자 변환
- `standard`: 기본 난독화와 안전한 문자열 변환
- `high`: 추가 제어 흐름 변환 등 강력한 난독화

`high`에서도 코드 실행 결과가 변하면 안 된다.

단순 정규식 치환이 아니라 검증된 AST 기반 파서를 사용한다. 기존 오픈소스 난독화 라이브러리 활용을 우선 검토하고 라이선스를 확인한다.

React 상태 처리, 이벤트 핸들러, 비동기 로직, 동적 import, 리플렉션, JSON 직렬화와의 호환성을 테스트한다.

### WG-003. 원본 소스 보호

프로덕션 환경에서 원본 개발 소스 노출을 최소화한다.

구현 요구:

- 공개 소스맵 비활성화
- 비공개 소스맵 생성 옵션
- 소스맵의 별도 아티팩트 저장
- `sourceMappingURL` 제거 정책
- 배포 대상 내 `.map` 파일 탐색
- 원본 TS/TSX/JSX 파일 노출 점검
- 디버그 로그 및 개발 정보 탐지
- 번들 내부 민감정보 패턴 탐지
- 보호 결과 리포트 출력

소스맵을 공개 디렉터리에서 제거하는 것뿐 아니라 배포 서버에서 접근할 수 없는지도 검증한다.

난독화를 거쳐도 번들에서 식별 가능한 함수명, URL, 문자열이 남을 수 있으므로 보호 범위를 정확히 보고한다.

### WG-004. 런타임 변조 탐지

다음 항목을 지원한다.

- 배포 시 생성한 리소스 해시
- 정적 파일 무결성 매니페스트
- Subresource Integrity 지원
- Content Security Policy 설정 가이드 및 검사
- 배포 리소스 해시 불일치 탐지
- 의심 이벤트 콜백
- 이벤트 중복 방지
- 탐지 로그 선택적 저장

자기 자신의 JavaScript가 이미 수정된 상황에서는 클라이언트 측 탐지를 신뢰할 수 없다는 점을 명시한다.

서버 또는 신뢰할 수 있는 배포 파이프라인의 검증을 권장한다.

### WG-005. 프레임워크 통합

최초 구현 대상:

1. Vanilla JavaScript SDK
2. TypeScript SDK
3. CLI
4. Vite 플러그인
5. React 예제
6. JSP + Servlet 예제

후속 확장:

- Webpack
- Next.js
- Nuxt
- Angular
- 기타 빌드 시스템

프레임워크별 로직을 중복 구현하지 않고 공통 엔진을 재사용한다.

### WG-006. 보안 정책 프리셋

네 가지 설정을 제공한다.

| 프리셋      | 내용                            |
| -------- | ----------------------------- |
| Basic    | 코드 압축, 원본 소스맵 보호              |
| Standard | Basic + 난독화 + 무결성 설정          |
| Strict   | Standard + 강화 난독화 + 선택적 접근 방해 |
| Custom   | 모든 기능 개별 설정                   |

기본값은 Standard로 한다.

Strict 모드에서도 완전한 소스 은닉이나 개발자 도구 차단을 보장하지 않는다.

### WG-007. TypeScript 지원

TypeScript를 프로젝트의 핵심 개발 언어로 사용한다.

요구사항:

- Strict TypeScript
- ESM 빌드
- 필요한 패키지에 한해 CommonJS 빌드
- 브라우저 IIFE 번들
- `.d.ts` 타입 선언
- 트리 셰이킹
- Side Effects 명시
- 공개 API 타입 테스트
- 주요 런타임 환경별 호환성 테스트

TypeScript의 타입 검사는 코드 보호 기능과 별개이며, TypeScript 원본은 JavaScript로 컴파일한 후 난독화한다.

---

## 4. 모노레포 구성

패키지 매니저는 pnpm, 모노레포 빌드 도구는 Turborepo를 우선 검토한다.

```
webguard/
├── apps/
│   ├── docs/
│   └── playground/
│
├── packages/
│   ├── core/
│   ├── browser/
│   ├── obfuscator/
│   ├── integrity/
│   ├── cli/
│   ├── vite-plugin/
│   └── shared/
│
├── examples/
│   ├── vanilla-js/
│   ├── vanilla-ts/
│   ├── react-vite/
│   └── jsp-servlet/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── compatibility/
│   └── performance/
│
├── .github/
│   └── workflows/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── LICENSE
├── README.md
├── CONTRIBUTING.md
└── SECURITY.md
```

패키지명은 임시로 `@webguard/*`를 사용하되 NPM 공개 여부와 이름 사용 가능 여부를 확인한다.

---

## 5. 공개 API 설계

다음은 목표 API다. 실제 구현 시 타입 안전성과 브라우저 호환성을 우선한다.

### 브라우저 SDK

```
import { WebGuard } from '@webguard/browser';

const guard = WebGuard.init({
  preset: 'standard',

  devtools: {
    detect: true,
    blockShortcuts: false,
    blockContextMenu: false,
    response: 'monitor'
  },

  integrity: {
    enabled: true
  },

  onThreat(event) {
    console.warn('[WebGuard]', event);
  }
});
```

`guard.destroy()` 호출 시 이벤트 리스너와 내부 리소스가 정상적으로 정리되도록 구현한다.

### 빌드 설정

```
// webguard.config.ts

import { defineConfig } from '@webguard/core';

export default defineConfig({
  preset: 'standard',

  obfuscation: {
    enabled: true,
    level: 'high',

    include: ['src/**/*.{js,ts,jsx,tsx}'],

    exclude: [
      '**/*.test.*',
      '**/node_modules/**'
    ]
  },

  sourceMaps: {
    public: false,
    privateArtifacts: true
  },

  integrity: {
    enabled: true,
    generateManifest: true
  }
});
```

`include` 패턴은 빌드 후 산출물 경로와 원본 소스 경로를 혼동하지 않도록 처리한다.

---

## 6. CLI

다음 명령을 제공한다.

```
webguard init
webguard build
webguard protect ./dist
webguard scan ./dist
webguard verify ./dist
webguard report
```

명령별 동작:

- `init`: 설정 파일 생성
- `build`: 기존 빌드 파이프라인과 연동
- `protect`: 빌드된 정적 자산 보호
- `scan`: 소스맵·민감정보·디버그 정보 탐색
- `verify`: 매니페스트 기반 파일 검증
- `report`: 보호 결과 확인

원본 파일을 덮어쓰지 않는 것이 기본값이다.

원본·보호 결과물·매니페스트를 구분하고, 실패 시 원본 상태를 보존한다.

---

## 7. WebGuard Playground

브라우저에서 보호 효과를 직접 확인하는 테스트 애플리케이션을 만든다.

### 화면 구성

1. 원본 JavaScript 입력
2. 난독화 정책 선택
3. 보호 결과 코드 표시
4. 원본·보호 코드 실행 결과 비교
5. 번들 크기 비교
6. 실행 속도 비교
7. 개발자 도구 탐지 상태
8. 무결성 검사 결과
9. 보호 리포트 출력

필수 기능:

- 코드 편집기
- 난독화 실행
- 결과 미리보기
- Basic/Standard/High 전환
- 코드 크기 변화 표시
- 오류 발생 여부 표시
- 복사 기능

사용자가 입력한 코드를 메인 페이지와 분리된 안전한 샌드박스에서 실행한다.

가능한 경우 브라우저 내에서 처리하고 별도 서버 업로드를 요구하지 않는다.

Playground에서 실제 보안 수준을 과장하는 점수는 사용하지 않는다.

---

## 8. 테스트 요구사항

### 단위 테스트

- 설정 병합
- 프리셋 처리
- 난독화 변환
- 무결성 해시
- 파일 제외 규칙
- 이벤트 처리
- 초기화 및 종료

### 통합 테스트

- Vanilla JS
- TypeScript
- React + Vite
- JSP + Servlet
- 프로덕션 빌드
- 동적 import
- 비동기 코드
- 외부 라이브러리

### 브라우저 테스트

Playwright를 활용하여 Chromium, Firefox, WebKit 환경을 검증한다.

테스트 항목:

- 주요 페이지 정상 렌더링
- 클릭 및 키보드 이벤트
- 폼 제출
- API 호출
- SPA 라우팅
- 동적 모듈 로딩
- 난독화 전후 동작 동일성
- CSP 적용 후 정상 실행
- 브라우저 개발자 도구 감지 오탐 최소화

### 보호 효과 테스트

- 원본 소스맵 공개 여부
- 원본 파일 접근 가능 여부
- 번들 문자열 추출 가능성
- 난독화 전후 식별자 노출 비교
- 배포 파일 변조 후 검증 결과
- 보호 SDK 비활성화 시 한계 확인

### 성능 기준

초기 목표:

- 보호 후 애플리케이션 기능 회귀 없음
- Standard 프리셋의 번들 크기 증가율 측정
- 초기 로딩 시간 변화 측정
- 브라우저 실행 CPU 및 메모리 사용량 측정
- 개발자 도구 탐지 기능의 불필요한 지속 폴링 최소화

수치 기준은 실제 벤치마크를 통해 설정하고 측정 결과를 공개한다.

---

## 9. 보안과 개인정보 보호

- 수집 기능은 기본적으로 비활성화한다.
- 외부 분석 서버로 데이터를 자동 전송하지 않는다.
- 사용자의 입력 내용이나 민감정보를 탐지 로그에 포함하지 않는다.
- 탐지 이벤트는 로컬 콜백으로 제공한다.
- 보안 중요 검증을 클라이언트 탐지에 의존하지 않는다.
- 라이브러리 자체가 XSS 위험을 만들지 않도록 설계한다.
- `eval`과 동적 코드 실행은 가급적 사용하지 않는다.
- CSP와의 호환성을 유지한다.
- 의존성 취약점 및 라이선스를 검토한다.
- 패키지 배포 무결성과 릴리스 아티팩트 출처 검증 방안을 마련한다.

---

## 10. 라이선스 및 오픈소스

완전 오픈소스를 목표로 한다.

MIT 또는 Apache-2.0을 검토하되, 최종 선택 전 사용하는 난독화 엔진과 기타 의존성의 라이선스 호환성을 확인한다.

필수 문서:

- README.md
- LICENSE
- CONTRIBUTING.md
- SECURITY.md
- CHANGELOG.md
- ARCHITECTURE.md
- THREAT_MODEL.md

README에는 지원 기술, 설치 방법, 보안 한계, 사용 예시, 브라우저 호환성, 벤치마크 결과를 포함한다.

---

## 11. 개발 단계

### Phase 1 — 공통 기반

- 모노레포 초기화
- TypeScript 설정
- 패키지 빌드
- ESLint / Prettier
- 테스트 환경
- CI
- Core 설정 엔진
- 프리셋 스키마

**완료 기준:** 전체 패키지가 빌드되고 공통 설정 및 테스트가 정상 동작한다.

### Phase 2 — 빌드 보호

- 난독화 엔진
- CLI
- 원본 소스맵 보호
- 정적 자산 스캔
- 무결성 매니페스트
- Vite 플러그인

**완료 기준:** Vanilla JS와 React 프로젝트에 실제 적용 가능해야 한다.

### Phase 3 — 브라우저 SDK

- 이벤트 기반 초기화
- 단축키 제한 옵션
- 컨텍스트 메뉴 제한 옵션
- 개발자 도구 감지
- 이벤트 콜백
- destroy 지원
- 브라우저 호환성 테스트

**완료 기준:** 주요 브라우저에서 기능 회귀와 심각한 오탐 없이 실행된다.

### Phase 4 — 예제 및 Playground

- Vanilla JS
- Vanilla TypeScript
- React + Vite
- JSP + Servlet
- 난독화 비교 화면
- 실행 결과 비교
- 성능 분석
- 문서 사이트

**완료 기준:** 사용자가 설명서만 보고 기존 프로젝트에 WebGuard를 적용할 수 있어야 한다.

### Phase 5 — 배포 준비

- 패키지 API 안정화
- 보안 검토
- 호환성 검증
- 버전 관리
- GitHub Actions CI/CD
- NPM 배포 준비
- 오픈소스 문서 완성

실제 패키지 공개나 외부 배포는 별도 승인 후 진행한다.

---

## 12. 우선순위

**P0 — 반드시 구현**

- 공통 TypeScript 엔진
- JavaScript 난독화
- 소스맵 비공개 처리
- CLI
- Vite 플러그인
- 브라우저 SDK
- F12 단축키 방해 옵션
- 주요 브라우저 테스트
- 기본 문서

**P1 — 다음 단계**

- 개발자 도구 탐지 개선
- 무결성 매니페스트
- CSP/SRI 검사
- JSP 통합 예제
- Playground
- 보안 리포트

**P2 — 확장 단계**

- Webpack / Next.js 전용 연동
- 고급 프레임워크 어댑터
- 로컬 관리 대시보드
- 분석 벤치마크 고도화
- 선택적 원격 이벤트 수집 어댑터

---

## 13. Codex 실행 지침

다음 순서로 개발한다.

1. 현재 저장소가 존재한다면 기존 파일과 설정을 분석한다.
2. 프로젝트가 비어 있다면 모노레포를 초기화한다.
3. 아키텍처와 패키지 의존성 관계를 설계한다.
4. Phase 1부터 실제 코드를 작성한다.
5. 단위 테스트와 통합 테스트를 작성한다.
6. 빌드 실패 및 타입 오류를 해결한다.
7. 예제 애플리케이션에서 실제 적용을 확인한다.
8. Phase별 완료 조건을 충족할 때까지 수정한다.
9. 구현 완료 항목과 미완료 항목을 명확히 구분한다.
10. 다음 개발 단계로 계속 진행한다.

별도 서버나 SaaS 계정 없이 핵심 기능이 작동해야 한다.

기존 사용자의 웹 애플리케이션에 적용했을 때 동작이 깨지지 않도록 호환성과 안전성을 우선한다.

난독화를 강하게 만드는 것보다 **실제 웹 애플리케이션의 동작을 보존하는 것**이 더 중요하다.

### 최종 완료 기준

- TypeScript 기반 오픈소스 모노레포가 구성되어 있다.
- JavaScript 및 TypeScript 프로젝트에서 사용할 수 있다.
- React + Vite에서 실제 난독화된 프로덕션 빌드를 생성한다.
- JSP 프로젝트에서도 브라우저 SDK를 적용할 수 있다.
- 개발자 도구 단축키 방해 옵션이 동작한다.
- 원본 소스맵이 공개 배포물에 포함되지 않는다.
- 무결성 매니페스트를 생성하고 검증할 수 있다.
- Playground에서 보호 전후 차이를 확인할 수 있다.
- 주요 자동화 테스트가 통과한다.
- README와 예제가 완성되어 있다.

**최종 목표: WebGuard를 별도의 서버 비용 없이 사용할 수 있고, 다양한 웹 프로젝트에서 설치와 설정만으로 적용 가능한 실용적인 오픈소스 브라우저 보호 솔루션으로 완성한다.**

### Codex에 전달할 때

위 지시서를 그대로 붙여 넣으면 돼. GitHub 저장소가 아직 없다면 `webguard`라는 이름으로 새 저장소를 만들도록 지시하면 되고, 기존 저장소가 있다면 그 경로에서 작업하도록 하면 돼.

참고할 공식 보안 기준은 [OWASP Web Frontend Security](https://cheatsheetseries.owasp.org/cheatsheets/Web_Frontend_Security_Cheat_Sheet.html?utm_source=chatgpt.com)와 [OWASP Client-Side Security Risks](https://owasp.org/projects/top-10-client-side-security-risks?utm_source=chatgpt.com)야.

핵심은 F12 차단 자체보다 F12를 열어도 원본 개발 코드와 민감정보가 노출되지 않도록 빌드·배포를 보호하는 것이야. HTML·CSS·JS 실행 결과와 네트워크 통신은 사용자에게 관찰 가능하다는 전제 아래 구현하도록 명시했어.