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

test("defaults to live observation and detects repeated DOM changes after explicit restoration", async ({
  page,
}) => {
  await page.goto("/#runtime-hardening");
  await expect(page.locator("#dom-monitor")).toBeChecked();
  await expect(page.locator("#pause-monitor")).toBeChecked();
  await expect(page.locator("#pause-status")).toHaveAttribute(
    "data-watch-state",
    "watching",
  );
  await expect
    .poll(async () =>
      Number(await page.locator("#pause-status").getAttribute("data-samples")),
    )
    .toBeGreaterThan(0);
  for (let index = 0; index < 2; index++) {
    await page.locator("#dom-tamper").click();
    await expect(page.locator("#dom-integrity-status")).toContainText(
      "변경 감지",
    );
    await expect(page.locator("#dom-monitor")).not.toBeChecked();
    await page.locator("#dom-restore").click();
    await expect(page.locator("#dom-monitor")).toBeChecked();
    await expect(page.locator("#dom-integrity-status")).toContainText(
      "기준 설정됨",
    );
  }
});

test("compares OFF and ON without accepting a response-only baseline change", async ({
  page,
}) => {
  await page.goto("/#runtime-hardening");
  await page.locator("#dom-monitor").uncheck();
  await page.locator("#dom-tamper").click();
  await expect(page.locator("#dom-integrity-status")).toContainText("OFF");
  await page.locator("#dom-monitor").check();
  await page.locator("#dom-tamper").click();
  await expect(page.locator("#dom-integrity-status")).toContainText(
    "변경 감지",
  );
  const changed = await page.locator("#dom-protected-notice").textContent();
  await page.locator("#dom-block").check();
  await expect(page.locator("#dom-protected-notice")).toHaveText(
    changed ?? "missing",
  );
  await expect(page.locator("#dom-integrity-status")).toContainText(
    "변경 감지",
  );
  await expect(page.locator("#dom-monitor")).not.toBeChecked();
});

test("responds to DOM tampering with a real modal and provides a demo exit", async ({
  page,
}) => {
  await page.goto("/#runtime-hardening");
  await page.locator("#dom-block").check();
  await page.locator("#dom-tamper").click();
  const dialog = page.locator("dialog[data-webguard-blocker]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("변경");
  await dialog.locator("[data-demo-block-exit]").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#dom-monitor")).not.toBeChecked();
  await expect(page.locator("#pause-monitor")).not.toBeChecked();
  await page.locator("#dom-restore").click();
  await expect(page.locator("#dom-monitor")).toBeChecked();
});

test("offers one visible protection flow and restores defaults", async ({
  page,
}) => {
  await page.goto("/#runtime-hardening");
  await page.locator("#hardening-disable").click();
  await expect(page.locator("#dom-monitor")).not.toBeChecked();
  await expect(page.locator("#pause-monitor")).not.toBeChecked();
  await expect(page.locator("#context")).not.toBeChecked();
  await page.locator("#hardening-enable").click();
  await expect(page.locator("#runtime-page-block")).toBeChecked();
  await expect(page.locator("#dom-monitor")).toBeChecked();
  await expect(page.locator("#pause-monitor")).toBeChecked();
  await expect(page.locator("#context")).toBeChecked();
  await page.locator("#hardening-disable").click();
  await page.locator("#runtime-defaults").click();
  await expect(page.locator("#dom-monitor")).toBeChecked();
  await expect(page.locator("#pause-monitor")).toBeChecked();
});

test("keeps manual timer results separate from automatic observation and cancels on OFF", async ({
  page,
}) => {
  await page.goto("/#runtime-hardening");
  await page.locator("#pause-check").click();
  await expect(page.locator("#pause-manual-status")).toContainText("이번 검사");
  await page.locator("#pause-monitor").uncheck();
  await expect(page.locator("#pause-status")).toHaveAttribute(
    "data-watch-state",
    "off",
  );
  await expect(page.locator("#pause-check")).toBeEnabled();
});

test("automatic watch reports an actual debugger pause without manual sampling and latches the signal", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "CDP pause/resume is a Chromium-specific verification tool",
  );
  await page.goto("/#runtime-hardening");
  await expect(page.locator("#pause-status")).toHaveAttribute(
    "data-watch-state",
    "watching",
  );
  await expect
    .poll(async () =>
      Number(await page.locator("#pause-status").getAttribute("data-samples")),
    )
    .toBeGreaterThan(0);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Debugger.enable");
  try {
    await cdp.send("Debugger.pause");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } finally {
    await cdp.send("Debugger.resume").catch(() => {});
    await cdp.detach();
  }
  await expect(page.locator("#pause-last-signal")).toContainText(
    "실행 지연 신호 감지",
  );
  await expect(page.locator("#pause-last-signal")).toContainText(
    "확정하지 않습니다",
  );
  const count = Number(
    await page.locator("#pause-status").getAttribute("data-samples"),
  );
  await expect
    .poll(async () =>
      Number(await page.locator("#pause-status").getAttribute("data-samples")),
    )
    .toBeGreaterThan(count);
  await expect(page.locator("#pause-last-signal")).toContainText(
    "실행 지연 신호 감지",
  );
  await page.locator("#pause-block").check();
  const blocking = await page.context().newCDPSession(page);
  await blocking.send("Debugger.enable");
  try {
    await blocking.send("Debugger.pause");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } finally {
    await blocking.send("Debugger.resume").catch(() => {});
    await blocking.detach();
  }
  const dialog = page.locator("dialog[data-webguard-blocker]");
  await expect(dialog).toBeVisible();
  await dialog.locator("[data-demo-block-exit]").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#pause-monitor")).not.toBeChecked();
});
