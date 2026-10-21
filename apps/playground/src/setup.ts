export type SetupProject = "dom" | "react" | "vanilla-string";
export interface SetupOptions {
  project: SetupProject;
  blockShortcuts: boolean;
  blockContextMenu: boolean;
}
export const setupOptionsMarkup = `<div id="setup-options" class="setup-options">
<label for="setup-project">프로젝트 유형</label>
<select id="setup-project"><option value="dom">DOM API 앱 · 엄격한 기본 정책</option><option value="react">React + Vite · 엄격한 기본 정책</option><option value="vanilla-string">vanilla 원본 템플릿 · Trusted Types 관찰</option></select>
<label><input id="setup-shortcuts" type="checkbox" checked aria-label="설정 코드: 단축키 제한"> F12·개발자 단축키 제한</label>
<label><input id="setup-context" type="checkbox" checked aria-label="설정 코드: 우클릭 제한"> 우클릭 메뉴 제한</label>
<p id="setup-policy-note" aria-live="polite"></p><p>복사할 설정만 바뀝니다. 현재 페이지의 보호 상태는 실시간 SDK 체험에서 직접 조작하세요.</p></div>`;

/** Fixed choices only; no source text or user-supplied URLs are interpolated. */
export function createViteSetup(options: SetupOptions): {
  code: string;
  note: string;
} {
  const react = options.project === "react";
  const compatibility = options.project === "vanilla-string";
  return {
    code: `import { defineConfig } from 'vite';
${react ? "import react from '@vitejs/plugin-react';\n" : ""}import { webguardApp } from 'uulab-webguard';

export default defineConfig({
  plugins: [${react ? "react(), " : ""}webguardApp({
${compatibility ? "    headers: { trustedTypes: 'report-only' },\n" : ""}    runtime: {
      devtools: { blockShortcuts: ${options.blockShortcuts}, blockContextMenu: ${options.blockContextMenu} },
    },
  })],
});`,
    note: compatibility
      ? "Trusted Types 관찰 모드: 원본 vanilla 템플릿의 innerHTML은 허용하며 HTML 문자열 삽입을 차단하지 않습니다. 다른 CSP 제한·강한 난독화·SRI는 유지됩니다. 관찰에는 실제 HTTP 헤더가 필요합니다."
      : "Trusted Types 강제 모드: 지원 브라우저에서 HTML 문자열 삽입을 제한합니다. innerHTML·outerHTML 등을 사용하는 앱은 빌드 호환성 경고를 확인하고 안전한 DOM API로 바꾸거나 관찰 모드를 명시적으로 선택하세요.",
  };
}
