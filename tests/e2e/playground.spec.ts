import { expect, test } from "@playwright/test";

test("protects locally, compares real output, and creates a local integrity report", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Outputs match", {
    timeout: 30000,
  });
  await expect(page.locator("#logs")).toContainText("Order total: 90");
  await expect(page.locator("#logs")).toContainText("With delivery: 95");
  expect(await page.locator("#output").inputValue()).not.toContain(
    "prices.reduce",
  );
  await expect(page.locator("#report")).toContainText(
    "Local output readback: hash matches",
  );
  await expect(page.locator("#timing")).toContainText("ms");
  await expect(page.locator("#size-change")).toContainText("%");
  await expect(page.getByLabel("Restrict context menu")).not.toBeChecked();
  await expect(
    page.getByLabel("Restrict F12 / inspect shortcuts"),
  ).not.toBeChecked();
  if (browserName === "chromium") {
    await page.screenshot({
      path: "docs/evidence/playground.png",
      fullPage: true,
    });
  }
});

test("rejects invalid JavaScript without executing it", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("Source JavaScript", { exact: true })
    .fill("const broken = ;");
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.getByRole("status")).toContainText("Protection failed:", {
    timeout: 30000,
  });
  await expect(page.locator("#equivalence")).toHaveText("Not run");
  await expect(page.locator("#output")).toHaveValue("");
});

test("terminates infinite execution and keeps the main app responsive", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Source JavaScript", { exact: true })
    .fill("while (true) {}");
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Execution error", {
    timeout: 30000,
  });
  await expect(page.locator("#logs")).toContainText("Execution timed out");
  await expect(
    page.getByRole("button", { name: "Protect & compare" }),
  ).toBeEnabled();
  expect(await page.locator("iframe").count()).toBe(0);
});

test("blocks network requests from source and protected execution", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("webguard-test.invalid"))
      requests.push(request.url());
  });
  await page.goto("/");
  await page
    .getByLabel("Source JavaScript", { exact: true })
    .fill(
      `fetch('https://webguard-test.invalid/private').catch(() => {}); console.log('request attempted');`,
    );
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Outputs match", {
    timeout: 30000,
  });
  expect(requests).toEqual([]);
});

test("ignores forged window messages and prevents worker access to the page", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    window.postMessage(
      { token: "forged", result: { logs: ["FORGED"], elapsed: 0 } },
      "*",
    ),
  );
  await expect(page.locator("#logs")).not.toContainText("FORGED");
  await page
    .getByLabel("Source JavaScript", { exact: true })
    .fill(
      `console.log(typeof document, typeof window); console.log('safe <img src=x onerror=alert(1)>');`,
    );
  await page.getByRole("button", { name: "Protect & compare" }).click();
  await expect(page.locator("#equivalence")).toHaveText("Outputs match", {
    timeout: 30000,
  });
  await expect(page.locator("#logs")).toContainText("undefined undefined");
  expect(await page.locator("#logs img").count()).toBe(0);
});

test("has a usable narrow layout and accessible controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Basic", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Basic", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
