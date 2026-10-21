/** Own-site demonstration policy. SDK consumer defaults remain opt-in.
 * Geometry is optional because window decorations and embedded browsers cause false positives.
 */
export const siteGuardOptions = {
  devtools: {
    detect: false,
    blockShortcuts: true,
    blockContextMenu: true,
    response: "block",
    shortcutScope: "page",
  },
  integrity: { enabled: true },
  // The product site observes visible-page stalls by default, with reporting only.
  debugging: {
    enabled: true,
    watch: true,
    intervalMs: 1000,
    thresholdMs: 1500,
    response: "report",
  },
} as const;
