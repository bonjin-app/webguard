const groups = [
  {
    title: "프런트엔드 빌드",
    note: "앱의 JavaScript 빌드에 난독화와 SDK를 연결합니다.",
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
    note: "서버 코드는 유지하고, 브라우저에 전달할 JavaScript와 응답 정책을 연결합니다.",
    choices: [
      [
        "JAVA",
        "Java · JSP / Servlet",
        "보호 자산·SRI 태그 · Servlet Filter 헤더",
      ],
      ["PYTHON", "Python · WSGI", "정적 자산 보호 · WSGI 응답 헤더"],
      ["PHP", "PHP", "공개 자산·비공개 템플릿 분리 · PHP 응답 헤더"],
    ],
  },
  {
    title: "SDK를 직접 연결할 때",
    note: "빌드 도구 없이 브라우저 가드부터 사용합니다. SDK 연결만으로 앱 코드가 난독화되지는 않습니다.",
    choices: [
      [
        "CDN",
        "CDN · 직접 다운로드",
        "고정 SDK URL·SRI · 외부 초기화 파일 연결",
      ],
    ],
  },
];

export const installationMarkup = `
<section id="install" class="installation-start" aria-labelledby="installation-heading">
<div class="eyebrow">START WITH YOUR STACK</div>
<h2 id="installation-heading">사용하는 환경을 선택하세요</h2>
<p>내 프로젝트에 맞는 문서 하나만 따라가세요. 필요한 파일, 설정 위치, 실행 명령과 적용 확인 방법을 순서대로 안내합니다.</p>
<ol class="installation-steps" aria-label="적용 순서"><li><span>1</span><strong>환경 선택</strong><small>내 앱에 맞는 가이드</small></li><li><span>2</span><strong>설치 · 설정</strong><small>예제 그대로 연결</small></li><li><span>3</span><strong>빌드 · 확인</strong><small>실행과 정책 검사</small></li></ol>
<div id="environments" class="installation-environments">
${groups.map((group) => `<div class="installation-group"><h3>${group.title}</h3><p>${group.note}</p><div class="installation-choices">${group.choices.map(([key, title, caption]) => `<a class="installation-choice" href="/docs/START_${key}.ko.html"><strong>${title}<span aria-hidden="true">↗</span></strong><span>${caption}</span><small>설치부터 적용 확인까지 →</small></a>`).join("")}</div></div>`).join("")}
</div>
<p class="installation-release">새 기능은 미게시 0.3.0 후보입니다. 각 가이드는 현재 후보의 고정 패키지 주소를 안내합니다. npm 공개 0.2.0과 구분하세요. <a href="#sdk-downloads">설치 명령·다운로드·CDN 확인 →</a></p>
</section>`;
