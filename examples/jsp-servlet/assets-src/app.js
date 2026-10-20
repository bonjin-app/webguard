/* global WebGuardSDK */
const guard = WebGuardSDK.WebGuard.init({
  devtools: { detect: true, blockShortcuts: false },
});
window.addEventListener("pagehide", () => guard.destroy(), { once: true });
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
