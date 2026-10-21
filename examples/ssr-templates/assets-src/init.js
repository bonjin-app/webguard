// Executed only in the browser, after the external SDK has loaded.
window.ssrGuard = window.WebGuardSDK.WebGuard.init({
  devtools: {
    detect: false,
    blockShortcuts: true,
    blockContextMenu: true,
    shortcutScope: "page",
    response: "monitor",
  },
});
