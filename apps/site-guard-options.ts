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
} as const;
