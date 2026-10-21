const guard = window.ssrGuard;
let count = 0;
document.querySelector("#counter").addEventListener("click", () => {
  document.querySelector("#count").textContent = String(++count);
});
document.querySelector("#guard-toggle").addEventListener("change", (event) => {
  const enabled = event.target.checked;
  guard.update({
    devtools: { blockShortcuts: enabled, blockContextMenu: enabled },
  });
  document.querySelector("#guard-status").textContent = enabled ? "on" : "off";
});
document.querySelector("#load-api").addEventListener("click", async () => {
  const result = document.querySelector("#api-result");
  try {
    const response = await fetch(
      document.querySelector("#load-api").dataset.url,
    );
    if (!response.ok) throw new Error("API request failed");
    const body = await response.json();
    result.textContent = `${body.runtime}: ${body.requestId}`;
    result.dataset.loaded = "true";
  } catch {
    result.textContent = "API request failed";
  }
});
document.querySelector("#client-status").textContent = "ready";
