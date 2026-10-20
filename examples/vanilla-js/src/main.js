import { WebGuard } from "@webguard/browser";
import "./style.css";

const counter = document.querySelector("#counter");
const lazyButton = document.querySelector("#lazy-load");
const lazyResult = document.querySelector("#lazy-result");
const form = document.querySelector("#echo-form");
const message = document.querySelector("#message");
const echo = document.querySelector("#echo-result");
const toggle = document.querySelector("#guard-toggle");
const status = document.querySelector("#guard-status");
const threat = document.querySelector("#threat-status");
let count = 0;
let guard = WebGuard.init();

counter.addEventListener("click", () => {
  counter.textContent = `Count: ${++count}`;
});
lazyButton.addEventListener("click", async () => {
  lazyButton.disabled = true;
  try {
    const { answer } = await import("./lazy.js");
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

// Enable controls only after their event handlers have been installed.
document.querySelectorAll("[data-await-startup]").forEach((control) => {
  control.removeAttribute("disabled");
});
document.querySelector("#startup-status").textContent = "Example ready";
