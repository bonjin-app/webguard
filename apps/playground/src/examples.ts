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
