/* global WebGuardSDK */
const guard = WebGuardSDK.installAutoGuard({
  devtools: { detect: false, blockShortcuts: true, blockContextMenu: true },
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) guard.destroy();
});
document.querySelector("#status").addEventListener("click", async () => {
  const output = document.querySelector("#result");
  try {
    const response = await fetch("api/status");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    output.textContent = `Servlet: ${data.status}, answer ${data.answer}`;
  } catch (error) {
    output.textContent = `Request failed: ${error.message}`;
  }
});
