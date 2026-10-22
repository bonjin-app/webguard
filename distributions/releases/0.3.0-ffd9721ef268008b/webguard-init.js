/* global WebGuardSDK */
/* WebGuard runtime setup. Host this file under your own /assets/ directory.
 * Load the pinned WebGuard SDK with defer + SRI before this external file.
 * Runtime guards do not obfuscate existing JavaScript; use the build integration.
 * Browser menus and DevTools themselves are controlled by the browser.
 */
window.webguard = WebGuardSDK.WebGuard.init({
  preset: "standard",
  devtools: {
    blockShortcuts: true,
    blockContextMenu: true,
    shortcutScope: "page",
    detect: false,
    response: "monitor",
  },
  integrity: { enabled: true },
});
window.addEventListener("pagehide", function (event) {
  // Cached pages resume with the same SDK instance and its existing input listeners.
  if (!event.persisted) window.webguard.destroy();
});
