import { expect, test } from "@playwright/test";

test("uses opaque CSS module names without breaking the rendered notice", async ({
  page,
}) => {
  await page.goto("/#runtime-hardening");
  const notice = page.locator("#dom-protected-notice");
  await expect(notice).toHaveAttribute("class", /^wg_[a-f0-9]{24}$/);
  await expect(notice).toHaveCSS("background-color", "rgb(239, 246, 255)");
  await expect(page.locator("#dom-identifier-result")).toContainText(
    (await notice.getAttribute("class")) ?? "missing",
  );
});

test("compares real DOM changes with monitoring off, on, and explicitly rebaselined", async ({
  page,
}) => {
  await page.goto("/#runtime-hardening");
  await page.locator("#dom-tamper").click();
  await expect(page.locator("#dom-protected-notice")).toContainText(
    "변경된 안내",
  );
  await expect(page.locator("#dom-integrity-status")).toContainText("OFF");
  await page.locator("#dom-restore").click();
  await page.locator("#dom-monitor").check();
  await expect(page.locator("#dom-integrity-status")).toContainText(
    "기준 설정됨",
  );
  await page.locator("#dom-tamper").click();
  await expect(page.locator("#dom-integrity-status")).toContainText(
    "변경 감지",
  );
  await page.locator("#dom-restore").click();
  await expect(page.locator("#dom-integrity-status")).toContainText(
    "기준 설정됨",
  );
  await page.locator("#dom-tamper").click();
  await expect(page.locator("#dom-integrity-status")).toContainText(
    "변경 감지",
  );
  await page.locator("#dom-monitor").uncheck();
  await expect(page.locator("#dom-integrity-status")).toContainText("OFF");
});

test("responds to DOM tampering with a real modal and provides a demo exit", async ({
  page,
}) => {
  await page.goto("/#runtime-hardening");
  await page.locator("#dom-monitor").check();
  await page.locator("#dom-block").check();
  await page.locator("#dom-tamper").click();
  const dialog = page.locator("dialog[data-webguard-blocker]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("변경");
  await dialog.locator("[data-demo-block-exit]").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#dom-monitor")).not.toBeChecked();
  await page.locator("#dom-restore").click();
});

test("runs one bounded timer sample and cancels it when the policy is turned off", async ({
  page,
}) => {
  await page.goto("/#runtime-hardening");
  await page.locator("#pause-monitor").check();
  await page.locator("#pause-check").click();
  await expect(page.locator("#pause-status")).toContainText("검사 중");
  await expect(page.locator("#pause-status")).toContainText(
    "큰 실행 지연 신호 없음",
    { timeout: 10000 },
  );
  await page.locator("#pause-check").click();
  await page.locator("#pause-monitor").uncheck();
  await expect(page.locator("#pause-status")).toContainText("OFF");
  await expect(page.locator("#pause-check")).toBeEnabled();
});

test("reports actual debugger-induced scheduling delay without claiming DevTools certainty", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "CDP pause/resume is a Chromium-specific verification tool",
  );
  await page.goto("/#runtime-hardening");
  await page.locator("#pause-monitor").check();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Debugger.enable");
  await page.locator("#pause-check").click();
  await cdp.send("Debugger.pause");
  // Let wall time advance while this owned test page's JavaScript is paused.
  await new Promise((resolve) => setTimeout(resolve, 2800));
  await cdp.send("Debugger.resume");
  await cdp.detach();
  await expect(page.locator("#pause-status")).toContainText(
    "실행 지연 신호 감지",
  );
  await expect(page.locator("#pause-status")).toContainText(
    "확정하지 않습니다",
  );
});
