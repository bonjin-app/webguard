import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env.WEBGUARD_PUBLIC_URL;
if (!baseURL || new URL(baseURL).protocol !== "https:")
  throw new Error("Set WEBGUARD_PUBLIC_URL to the deployed HTTPS demo URL");
const browserTests = [
  "**/e2e/demo.spec.ts",
  "**/e2e/playground.spec.ts",
  "**/e2e/lab.spec.ts",
];
export default defineConfig({
  testDir: "tests",
  timeout: 45000,
  expect: { timeout: 15000 },
  workers: 3,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "http", testMatch: "**/public/*.spec.ts" },
    {
      name: "chromium",
      testMatch: browserTests,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testMatch: browserTests,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testMatch: browserTests,
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
