const groups = [
  {
    title: "파일 · CDN으로 SDK 연결",
    note: "npm·Node.js 없이 런타임 가드를 사용합니다. 앱 코드를 변환하지 않는 가장 간단한 시작 방법입니다.",
    choices: [
      [
        "CDN",
        "CDN · 직접 다운로드",
        "고정 SDK URL·SRI · 외부 초기화 파일 연결",
      ],
    ],
  },
  {
    title: "프런트엔드 빌드",
    note: "앱 코드 난독화가 필요할 때 선택합니다. Node.js가 있는 빌드 환경에 보호 단계를 연결합니다.",
    choices: [
      [
        "VITE",
        "Vite · React / Vue",
        "Vite 플러그인 한 번 설정 · 운영 빌드에 자동 적용",
      ],
      ["NEXT", "Next.js", "App Router · Webpack 운영 클라이언트 청크 보호"],
      ["STATIC", "Webpack · esbuild", "기존 빌드 뒤 protect-app 단계 연결"],
      [
        "HTML",
        "HTML · jQuery",
        "정적 HTML·외부/인라인 JS를 별도 출력으로 보호",
      ],
    ],
  },
  {
    title: "서버에서 HTML을 만드는 앱",
    note: "서버 코드와 배포 방식은 유지합니다. SDK 파일 연결과 선택적 자산 변환·응답 정책을 환경별로 안내합니다.",
    choices: [
      [
        "JAVA",
        "Java · JSP / Servlet",
        "npm 없이 파일 복사 · JSP 태그 연결부터",
      ],
      ["PYTHON", "Python · WSGI", "정적 자산 보호 · WSGI 응답 헤더"],
      ["PHP", "PHP", "공개 자산·비공개 템플릿 분리 · PHP 응답 헤더"],
    ],
  },
];

export const installationMarkup = `
<section id="install" class="installation-start" aria-labelledby="installation-heading">
<div class="eyebrow">01 · 환경 선택</div>
<h2 id="installation-heading">사용하는 환경을 선택하세요</h2>
<p>런타임 가드만 필요하면 파일·CDN 가이드부터 시작하세요. 앱 JavaScript도 난독화하려면 아래에서 사용하는 빌드 또는 서버 환경을 고르세요.</p>
<ol class="installation-steps" aria-label="적용 순서"><li><span>1</span><strong>연결 방식 선택</strong><small>파일·CDN·빌드</small></li><li><span>2</span><strong>설치 · 설정</strong><small>가이드대로 연결</small></li><li><span>3</span><strong>앱에서 확인</strong><small>동작·배포 검사</small></li></ol>
<div id="environments" class="installation-environments">
${groups.map((group) => `<div class="installation-group"><h3>${group.title}</h3><p>${group.note}</p><div class="installation-choices">${group.choices.map(([key, title, caption]) => `<a class="installation-choice" href="/docs/START_${key}.ko.html"><strong>${title}<span aria-hidden="true">↗</span></strong><span>${caption}</span><small>설치부터 적용 확인까지 →</small></a>`).join("")}</div></div>`).join("")}
</div>
<p class="installation-boundary"><strong>SDK 연결과 앱 코드 난독화는 별개입니다.</strong> SDK는 선택한 런타임 기능을 실행합니다. 앱 코드를 난독화하거나 공개 소스맵을 제거하려면 빌드 통합이 필요합니다. 인증·권한 검증은 서버에서 처리하세요.</p>
<p class="installation-release">새 기능은 미게시 0.3.0 후보입니다. 각 가이드는 현재 후보의 고정 패키지 주소를 안내합니다. npm 공개 0.2.0과 구분하세요. <a href="#sdk-downloads">SDK 파일·CDN·빌드 패키지 확인 →</a></p>
<p class="installation-operations">운영에 적용하기 전에는 <a href="/docs/OPERATIONS.ko.html">개발·검증·운영 가이드</a>에서 점검과 롤백 순서를 확인하세요.</p>
</section>`;
