import { WebGuard, type WebGuardInstance } from "@webguard/browser";
import "./style.css";

const counter = document.querySelector<HTMLButtonElement>("#counter")!;
const lazyButton = document.querySelector<HTMLButtonElement>("#lazy-load")!;
const lazyResult = document.querySelector<HTMLOutputElement>("#lazy-result")!;
const form = document.querySelector<HTMLFormElement>("#echo-form")!;
const message = document.querySelector<HTMLInputElement>("#message")!;
const echo = document.querySelector<HTMLOutputElement>("#echo-result")!;
const toggle = document.querySelector<HTMLInputElement>("#guard-toggle")!;
const status = document.querySelector<HTMLParagraphElement>("#guard-status")!;
const threat = document.querySelector<HTMLParagraphElement>("#threat-status")!;
let count = 0;
let guard: WebGuardInstance = WebGuard.init();

counter.addEventListener("click", () => {
  counter.textContent = `Count: ${++count}`;
});
lazyButton.addEventListener("click", async () => {
  lazyButton.disabled = true;
  try {
    const { answer } = await import("./lazy");
    lazyResult.textContent = `Loaded: ${await answer()}`;
  } catch {
    lazyResult.textContent = "Unable to load the module";
  } finally {
    lazyButton.disabled = false;
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  echo.textContent = message.value;
});
toggle.addEventListener("change", () => {
  guard.destroy();
  guard = WebGuard.init({
    devtools: {
      blockShortcuts: toggle.checked,
      blockContextMenu: false,
      detect: false,
      response: "monitor",
    },
    onThreat(event) {
      threat.textContent = `Advisory event: ${event.type}`;
    },
  });
  status.textContent = toggle.checked
    ? "Shortcut blocking on"
    : "Shortcut blocking off";
});
window.addEventListener("pagehide", () => guard.destroy(), { once: true });
