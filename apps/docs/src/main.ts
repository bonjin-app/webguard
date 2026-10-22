import { downloadsMarkup, initDownloads } from "../../downloads";
import "../../downloads.css";
import "./style.css";
import { installationMarkup } from "./installation";
import {
  docsOutlineMarkup,
  verificationMarkup,
  configurationMarkup,
  referencesMarkup,
  supportMarkup,
} from "./content";
import { getAutoGuard, installAutoGuard } from "@webguard/browser";
import { siteGuardOptions } from "../../site-guard-options";

// Reuse the build-injected instance. Development starts the same policy here.
const siteGuard = getAutoGuard() ?? installAutoGuard(siteGuardOptions);
const logoUrl = new URL("favicon.svg", document.baseURI).href;
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
<header class="docs-header"><a href="/demo" class="docs-brand" aria-label="WebGuard 데모 홈"><img class="docs-logo" src="${logoUrl}" alt="" width="36" height="36"><span>WebGuard</span><span class="docs-badge">개발자 가이드</span></a><div class="docs-header-links"><a href="#install">SDK 적용하기</a><a class="docs-demo-link" href="/demo">데모 체험</a></div></header>
<div class="layout">${docsOutlineMarkup}<main id="main-content" tabindex="-1">
<section id="overview" class="docs-intro docs-home-intro"><p class="eyebrow">WEBGUARD GUIDE</p><h1>내 환경에 맞게,<br><span>설치부터 적용 확인까지.</span></h1><p class="lead">환경을 고르고 패키지를 연결하세요.<br>빌드·브라우저·배포에서 확인할 내용을 순서대로 안내합니다.</p><div class="docs-actions"><a class="primary" href="#install">내 환경 선택하기</a><a class="secondary" href="#verify-installation">적용 확인 순서</a></div><p class="docs-meta">Node.js 22.12+ · 별도 서비스 계정 없이 사용 · npm 미게시 후보</p><a class="docs-live-link" href="#site-protection-controls">이 문서에 적용된 실제 보호 설정 보기 ↗</a></section>
${installationMarkup}
${downloadsMarkup}
${verificationMarkup}
${configurationMarkup}
${referencesMarkup}
${supportMarkup}
<footer>WebGuard · 내 웹 앱에 연결하는 보호 SDK</footer></main></div>`;

const outlineLinks =
  document.querySelectorAll<HTMLAnchorElement>(".docs-outline a");
function syncCurrentSection() {
  const current = window.location.hash || "#overview";
  let target: HTMLElement | null = null;
  try {
    target = document.getElementById(decodeURIComponent(current.slice(1)));
  } catch {
    /* An invalid URL fragment cannot match a section. */
  }
  let opened = false;
  if (target) {
    for (
      let ancestor: HTMLElement | null = target;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
        ancestor.open = true;
        opened = true;
      }
    }
  }
  if (opened) requestAnimationFrame(() => target?.scrollIntoView());
  let active = current;
  for (let ancestor = target; ancestor; ancestor = ancestor.parentElement) {
    const hash = `#${ancestor.id}`;
    if (
      Array.from(outlineLinks).some(
        (link) => link.getAttribute("href") === hash,
      )
    ) {
      active = hash;
      break;
    }
  }
  for (const link of outlineLinks) {
    if (link.getAttribute("href") === active)
      link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}
window.addEventListener("hashchange", syncCurrentSection);
syncCurrentSection();
window.addEventListener("load", () => {
  if (!window.location.hash) return;
  syncCurrentSection();
  try {
    document
      .getElementById(decodeURIComponent(window.location.hash.slice(1)))
      ?.scrollIntoView();
  } catch {
    /* Ignore malformed fragments. */
  }
});

const siteSwitch = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!;
const pageBlockSwitch = siteSwitch("site-page-block");
const shortcutSwitch = siteSwitch("site-shortcuts");
const contextSwitch = siteSwitch("site-context");
const detectSwitch = siteSwitch("site-detect");
const pauseWatchSwitch = siteSwitch("site-pause-watch");
const siteStatus = document.querySelector<HTMLElement>(
  "#site-protection-state",
)!;
const eventStatus = document.querySelector<HTMLElement>(
  "#site-protection-event",
)!;

function renderSiteProtection() {
  const options = siteGuard.getOptions().devtools;
  pageBlockSwitch.checked = options?.response === "block";
  shortcutSwitch.checked = options?.blockShortcuts === true;
  contextSwitch.checked = options?.blockContextMenu === true;
  detectSwitch.checked = options?.detect === true;
  const debugging = siteGuard.getOptions().debugging;
  pauseWatchSwitch.checked =
    debugging?.enabled === true && debugging.watch === true;
  siteStatus.textContent = `실제 SDK 상태 · 페이지 보호 안내 ${pageBlockSwitch.checked ? "ON" : "OFF"} · 단축키 ${shortcutSwitch.checked ? "ON" : "OFF"} · 우클릭 ${contextSwitch.checked ? "ON" : "OFF"} · 크기 추정 ${detectSwitch.checked ? "ON" : "OFF"}`;
}

function updateSiteProtection() {
  siteGuard.update({
    debugging: {
      enabled: pauseWatchSwitch.checked,
      watch: pauseWatchSwitch.checked,
      response: "report",
    },
    devtools: {
      detect: detectSwitch.checked,
      blockShortcuts: shortcutSwitch.checked,
      blockContextMenu: contextSwitch.checked,
      response: pageBlockSwitch.checked ? "block" : "monitor",
      shortcutScope: "page",
    },
  });
  renderSiteProtection();
  renderDebuggingState();
}

siteGuard.update({
  onThreat(event) {
    const messages: Record<string, string> = {
      "shortcut-blocked": "페이지에 전달된 검사 단축키를 취소했습니다.",
      "shortcut-unavailable": "이 입력은 취소할 수 없습니다.",
      "context-menu-blocked": "페이지의 우클릭 기본 동작을 취소했습니다.",
      "context-menu-unavailable": "이 우클릭 이벤트는 취소할 수 없습니다.",
      "execution-pause-suspected":
        "실행 지연 신호를 관측했습니다. 개발자도구 열림을 확정하지 않습니다.",
      "devtools-heuristic":
        "크기 변화 추정 신호입니다. 개발자도구 열림을 확정하지 않습니다.",
      "page-blocked":
        "페이지 보호 안내가 표시되었습니다. 개발자도구 창의 상태는 바꾸지 않습니다.",
      "page-unblocked": "페이지 보호 안내가 해제되었습니다.",
      "page-block-unavailable":
        "이 브라우저에서 페이지 보호 안내를 표시할 수 없습니다.",
    };
    eventStatus.textContent =
      messages[event.type] ?? `SDK 이벤트: ${event.type}`;
    if (event.type !== "page-blocked") return;
    const dialog = document.querySelector("[data-webguard-blocker]");
    if (!dialog || dialog.querySelector("[data-site-block-exit]")) return;
    const exit = document.createElement("button");
    exit.type = "button";
    exit.setAttribute("data-site-block-exit", "");
    exit.className = "site-protection-exit";
    exit.textContent = "이 사이트의 보호 모드 끄기";
    exit.addEventListener("click", () => {
      pageBlockSwitch.checked = false;
      updateSiteProtection();
    });
    (dialog.querySelector("section") ?? dialog).append(exit);
  },
});
for (const control of [
  pageBlockSwitch,
  shortcutSwitch,
  contextSwitch,
  detectSwitch,
  pauseWatchSwitch,
])
  control.addEventListener("change", updateSiteProtection);
renderSiteProtection();
let debuggingStatusTimer: ReturnType<typeof setTimeout> | undefined;
let debuggingStatusHidden = false;
function renderDebuggingState() {
  const state = siteGuard.getDebuggingState();
  const output = document.querySelector<HTMLElement>("#site-debugging-state")!;
  output.dataset.state = state.state;
  output.dataset.samples = String(state.samples);
  const name = {
    off: "OFF",
    manual: "수동 검사 허용",
    watching: "자동 감시 중",
    suspended: "페이지 숨김 · 일시 중지",
    unavailable: "관찰 불가",
  }[state.state];
  output.textContent =
    "실행 지연 · " +
    name +
    " · 관찰 " +
    state.samples +
    "회" +
    (state.lastCheckedAt === null
      ? " · 첫 관찰 대기"
      : " · 마지막 " + new Date(state.lastCheckedAt).toLocaleTimeString()) +
    (state.lastSuspicionAt === null
      ? ""
      : " · 최근 의심 신호 " +
        new Date(state.lastSuspicionAt).toLocaleTimeString());
}
function scheduleDebuggingStatus() {
  clearTimeout(debuggingStatusTimer);
  debuggingStatusTimer = undefined;
  renderDebuggingState();
  if (debuggingStatusHidden || document.visibilityState !== "visible") return;
  debuggingStatusTimer = setTimeout(scheduleDebuggingStatus, 1000);
}
const resumeDebuggingStatus = () => {
  debuggingStatusHidden = false;
  scheduleDebuggingStatus();
};
window.addEventListener("pageshow", resumeDebuggingStatus);
document.addEventListener("visibilitychange", scheduleDebuggingStatus);
scheduleDebuggingStatus();
window.addEventListener("pagehide", (event) => {
  debuggingStatusHidden = true;
  clearTimeout(debuggingStatusTimer);
  if (!event.persisted) {
    document.removeEventListener("visibilitychange", scheduleDebuggingStatus);
    window.removeEventListener("pageshow", resumeDebuggingStatus);
    siteGuard.destroy();
  }
});

void initDownloads();
