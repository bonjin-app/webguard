import { withWebGuard } from "uulab-webguard/next";

export default withWebGuard(
  {
    reactStrictMode: true,
    // Existing synchronous hooks still run first.
    webpack(config) {
      config.resolve.alias["webguard-existing-alias"] = false;
      return config;
    },
  },
  {
    preset: "strict",
    domIdentifiers: true,
    runtime: {
      devtools: {
        detect: false,
        blockShortcuts: true,
        blockContextMenu: true,
        response: "block",
        shortcutScope: "page",
      },
      integrity: { enabled: true },
      debugging: { enabled: true, watch: true, response: "report" },
    },
  },
);
