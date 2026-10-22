import { createViteSetup } from "./setup";
export const examples = [
  {
    id: "cart",
    title: "장바구니 계산",
    description: "상품 합계와 배송비를 계산하고 보호 전후 결과를 비교합니다.",
    expected: "Order total: 90 · With delivery: 95",
    source: `// Demonstration only: the server must validate real prices and totals.
const prices = [19, 24, 12, 35];
const total = prices.reduce((sum, price) => sum + price, 0);
console.log('Order total:', total);
console.log('With delivery:', total + 5);`,
  },
  {
    id: "form",
    title: "폼 검증",
    description:
      "문자열·정규식·조건문을 보호하면서 입력 검증 동작을 유지합니다.",
    expected: "Valid form: true · Invalid form: false",
    source: `// Interface feedback only: validate submitted data again on the server.
function validateProfile(profile) {
  const name = String(profile.name || '').trim();
  return name.length >= 3 && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(profile.email);
}
console.log('Valid form:', validateProfile({ name: 'Alex', email: 'alex@example.com' }));
console.log('Invalid form:', validateProfile({ name: 'A', email: 'invalid' }));`,
  },
  {
    id: "report",
    title: "데이터 집계",
    description: "배열·객체·한글 문자열을 포함한 집계 로직을 실행합니다.",
    expected: 'Region totals: {"서울":5,"부산":4}',
    source: `const records = [
  { region: '서울', count: 2 },
  { region: '부산', count: 4 },
  { region: '서울', count: 3 },
];
const totals = records.reduce((result, row) => {
  result[row.region] = (result[row.region] || 0) + row.count;
  return result;
}, {});
console.log('Region totals:', JSON.stringify(totals));`,
  },
] as const;

export const integrations = [
  {
    id: "vite",
    title: "Vite 설정",
    hint: "미게시 0.3.0 로컬 후보 기준입니다. 검토한 tgz를 설치하거나 0.3.0 게시 후 npm으로 설치하세요. 현재 공개 버전은 0.2.0입니다. SDK·초기 CSP 메타가 자동 적용되며 외부 API는 정확한 출처를 허용합니다.",
    code: createViteSetup({
      project: "dom",
      blockShortcuts: true,
      blockContextMenu: true,
    }).code,
  },
  {
    id: "next",
    title: "Next.js / React SSR",
    hint: "Next App Router의 운영 클라이언트 청크에 적용합니다. SSR·RSC·서버 코드는 유지하며 Next 16은 Webpack 빌드가 필요합니다. 기존 CSP·nonce·HTTP 정책은 앱에서 관리합니다. 미게시 0.3.0 후보 기준입니다.",
    code: `// next.config.mjs — 기존 설정을 첫 번째 인수에 유지
import { withWebGuard } from 'uulab-webguard/next';

export default withWebGuard({ reactStrictMode: true }, {
  preset: 'strict',
  runtime: {
    devtools: { blockShortcuts: true, blockContextMenu: true },
  },
});

// package.json scripts: "build": "next build --webpack"
// CSP·nonce·SRI는 기존 Next 앱/호스트에서 관리
// .next 전체를 protect-app 입력으로 지정하지 마세요.`,
  },
  {
    id: "generic",
    title: "범용 빌드",
    hint: "Webpack·esbuild·일반 정적 HTML에서 기존 빌드 다음에 실행합니다. Vite 설치가 필요 없습니다. 출력은 새 경로를 사용하고, 서버 헤더를 실제 적용하세요. Next.js·Nuxt SSR 자동 통합은 포함하지 않습니다.",
    code: `# 검토한 미게시 0.3.0 tgz 설치 후 · 기존 빌드는 유지
npm run build:raw
npx --no-install webguard protect-app dist --output dist-protected \\
  --restrict-shortcuts --restrict-context-menu --trusted-types report-only
npx --no-install webguard-serve dist-protected --port 4173

# Node API: import { protectAppDirectory } from 'uulab-webguard/build'
# report-only는 Trusted Types 관찰 모드이며 실제 HTTP 헤더가 필요`,
  },
  {
    id: "classic",
    title: "일반 HTML SDK",
    hint: "HTML·JSP·PHP·ASP.NET에서 독립 SDK를 외부 스크립트로 연결합니다. SDK만 붙이면 난독화는 되지 않으므로 정적 JS 보호는 범용 빌드 경로를 사용하세요. 서버 템플릿 예제는 실행 미검증 레시피입니다.",
    code: `<!-- 패키지의 browser.global.js를 /assets/webguard.global.js로 복사 -->
<script src="/assets/webguard.global.js"></script>
<script src="/assets/guard-init.js"></script>
<script src="/assets/app.js" defer></script>

// 별도 파일 /assets/guard-init.js
const guard = WebGuardSDK.WebGuard.init({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});
// 종료 시 guard.destroy();`,
  },
  {
    id: "live",
    title: "실시간 변경 코드",
    hint: "자동 SDK가 시작된 앱에서 즉시 켜고 끕니다. 새로고침하면 빌드 설정으로 돌아갑니다.",
    code: `import { getWebGuard } from 'uulab-webguard/client';

// 지금 켜기
getWebGuard()?.update({
  devtools: { blockShortcuts: true, blockContextMenu: true },
});

// 필요할 때 끄기
getWebGuard()?.update({
  devtools: { blockShortcuts: false, blockContextMenu: false },
});`,
  },
  {
    id: "server",
    title: "서버 헤더 적용",
    hint: "검토한 0.3.0 로컬 후보 설치 후 사용하는 명령입니다. 실제 HTTP 정책·비공개 파일 제한을 적용하며 Vite preview도 별도 설정 없이 적용합니다. 정적 호스트는 자체 규칙을 반영하세요.",
    code: `# 검토한 로컬 0.3.0 tgz 설치 후 또는 0.3.0 게시 후
npm run build
npx webguard-serve dist --port 4173

# http://127.0.0.1:4173 에서 빌드와 실제 HTTP 정책 확인
# 정적 호스트는 _headers 적용과 비공개 경로 거부 규칙을 모두 설정
# frame-ancestors와 report-only는 실제 HTTP 헤더가 필요`,
  },
  {
    id: "jsp",
    title: "JSP / Servlet 준비",
    hint: "Java 17·Maven·Tomcat 10.1 이상이 필요합니다. 서버 코드는 브라우저 난독화 대상이 아닙니다.",
    code: `node scripts/prepare-jsp.mjs
mvn -B -f examples/jsp-servlet/pom.xml package

# 생성 파일: examples/jsp-servlet/target/webguard.war
# WAR를 Tomcat에 배포한 뒤 /webguard/ 열기
# 통합 코드는 examples/jsp-servlet/README.md 참고`,
  },
] as const;
