import { expect, test } from "@playwright/test";

test("the documentation applies its own SDK and controls actual page protection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/docs/");
  const controls = page.locator("#site-protection-controls");
  await controls.locator("summary").click();
  await expect(page.locator("#site-page-block")).toBeChecked();
  await expect(page.locator("#site-shortcuts")).toBeChecked();
  await expect(page.locator("#site-context")).toBeChecked();
  await expect(page.locator("#site-detect")).not.toBeChecked();
  await expect(page.locator("[data-webguard-blocker]")).toHaveCount(0);
  await expect(controls).toContainText("콘솔 실행은 통제할 수 없습니다");

  // A trusted macOS inspection chord delivered to this page drives the actual SDK.
  await page.keyboard.press("Meta+Alt+i");
  const dialog = page.locator("dialog[data-webguard-blocker]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveJSProperty("open", true);
  await dialog
    .getByRole("button", { name: "이 사이트의 보호 모드 끄기" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#site-page-block")).not.toBeChecked();
  await expect(page.locator("#site-protection-state")).toContainText(
    "페이지 보호 안내 OFF",
  );

  // Disable input restriction and observe the real trusted DOM event's result.
  await page.locator("#site-shortcuts").uncheck();
  await page.evaluate(() => {
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.code === "KeyI")
          queueMicrotask(() => {
            document.documentElement.dataset.docsShortcutPrevented = String(
              event.defaultPrevented,
            );
          });
      },
      { once: false },
    );
  });
  await page.keyboard.press("Meta+Alt+i");
  await expect(page.locator("html")).toHaveAttribute(
    "data-docs-shortcut-prevented",
    "false",
  );
  await expect(dialog).toHaveCount(0);
  await page.locator("#site-shortcuts").check();
  await page.keyboard.press("Meta+Alt+i");
  await expect(page.locator("html")).toHaveAttribute(
    "data-docs-shortcut-prevented",
    "true",
  );
  await expect(dialog).toHaveCount(0);

  // Context-menu switch affects this document, not a separate simulated frame.
  await controls.locator("summary").click({ button: "right" });
  await expect(page.locator("#site-protection-event")).toContainText(
    "우클릭 기본 동작을 취소",
  );
  await page.locator("#site-context").uncheck();
  await page.evaluate(() => {
    document.addEventListener(
      "contextmenu",
      (event) => {
        queueMicrotask(() => {
          document.documentElement.dataset.docsMenuPrevented = String(
            event.defaultPrevented,
          );
        });
      },
      { once: true },
    );
  });
  await controls.locator("summary").click({ button: "right" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-docs-menu-prevented",
    "false",
  );
  await page.reload();
  await controls.locator("summary").click();
  await expect(page.locator("#site-page-block")).toBeChecked();
  await expect(page.locator("#site-context")).toBeChecked();
  await expect(page.locator("#site-shortcuts")).toBeChecked();
  await expect(page.locator("#site-detect")).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
