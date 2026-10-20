import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  timeout: 30000,
  expect: { timeout: 10000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    ["@webguard/playground", 4173],
    ["@webguard/example-react-vite", 4174],
    ["@webguard/docs", 4175],
    ["@webguard/example-vanilla-js", 4176],
    ["@webguard/example-vanilla-ts", 4177],
  ].map(([name, port]) => ({
    command:
      name === "@webguard/example-react-vite"
        ? `node examples/security-server/server.mjs examples/react-vite/dist --port ${port}`
        : `pnpm --filter ${name} preview --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30000,
  })),
});
