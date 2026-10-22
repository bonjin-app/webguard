import { test, expect } from "@playwright/test";

for (const name of ["vanilla-js", "vanilla-ts"]) {
  test(`${name} keeps controls disabled until its module is ready`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/examples/${name}/assets/*.js`, async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto(`/examples/${name}/`, { waitUntil: "commit" });
      await expect(page.locator("#counter")).toBeDisabled();
      await expect(page.locator("#guard-toggle")).toBeDisabled();
      release();
      await expect(page.locator("#counter")).toBeEnabled();
      await page.locator("#counter").click();
      await expect(page.locator("#counter")).toHaveText("Count: 1");
    } finally {
      release();
    }
  });
}

test("runs a ready-made strong example and shows its real output", async ({
  page,
}) => {
  await page.goto("/#try-examples");
  await page.getByRole("button", { name: "폼 검증 예제 실행" }).click();
  await expect(page.locator("#equivalence")).toHaveText("출력 일치", {
    timeout: 30000,
  });
  await expect(page.locator("#logs")).toContainText("Valid form: true");
  await expect(page.locator("#logs")).toContainText("Invalid form: false");
  await expect(
    page.getByRole("button", { name: "강력", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#output")).not.toHaveValue("");
});
test("demonstrates live SDK controls and provides selectable integration code", async ({
  page,
}) => {
  await page.goto("/#live-demo");
  // This comparison exercises basic input cancellation, independently of the
  // site's default modal response, covered by the own-site guard scenarios.
  await page.locator("#runtime-page-block").uncheck();
  await page.locator("#runtime-advanced > summary").click();
  await page.getByRole("button", { name: "F12 시험 이벤트 실행" }).click();
  await expect(page.locator("#live-result")).toContainText("차단됨");
  await page.getByLabel("Restrict F12 / inspect shortcuts").check();
  await page.getByRole("button", { name: "F12 시험 이벤트 실행" }).click();
  await expect(page.locator("#live-result")).toContainText("차단됨");
  await page.getByLabel("Restrict F12 / inspect shortcuts").uncheck();
  await page.getByRole("button", { name: "F12 시험 이벤트 실행" }).click();
  await expect(page.locator("#live-result")).toContainText("허용됨");
  await page.goto("/#setup");
  await page
    .getByRole("button", { name: "실시간 변경 코드", exact: true })
    .click();
  await expect(page.locator("#setup-code")).toContainText(
    "getWebGuard()?.update",
  );
  await page.getByRole("button", { name: "Vite 설정", exact: true }).click();
  await expect(page.locator("#setup-code")).toContainText("webguardApp");
  await expect(page.locator("#setup-code")).toContainText(
    "blockShortcuts: true",
  );
});
test("opens working protected examples and documentation through same-origin links", async ({
  page,
}) => {
  await page.goto("/#app-examples");
  const origin = new URL(page.url()).origin;
  await page
    .getByRole("link", { name: "React 데모 열기", exact: true })
    .click();
  expect(page.url()).toBe(origin + "/examples/react/");
  await expect(page.getByTestId("guard-startup")).toHaveText(
    "Automatic SDK ready before React render",
  );
  await page.getByRole("button", { name: "Count: 0", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Count: 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load module", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Lazy module loaded" }),
  ).toHaveText("Lazy module loaded: 42");
  for (const name of ["JavaScript", "TypeScript"]) {
    await page.goto("/#app-examples");
    await page
      .getByRole("link", { name: `${name} 데모 열기`, exact: true })
      .click();
    expect(new URL(page.url()).origin).toBe(origin);
    await page.locator("#counter").click();
    await expect(page.locator("#counter")).toContainText("1");
    await page.locator("#lazy-load").click();
    await expect(page.locator("#lazy-result")).toContainText("42");
  }
  await page.goto("/");
  await page.getByRole("link", { name: "사용 가이드 ↗", exact: true }).click();
  expect(page.url()).toBe(origin + "/docs/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
