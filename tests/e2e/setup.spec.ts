import { expect, test } from "@playwright/test";

test("generates one Vite configuration for strict React and explicit vanilla compatibility", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByLabel("프로젝트 유형")).toBeVisible({ timeout: 1500 });
  await page.getByLabel("프로젝트 유형").selectOption("react");
  await expect(page.locator("#setup-code")).toContainText(
    "import react from '@vitejs/plugin-react'",
  );
  await expect(page.locator("#setup-code")).toContainText(
    "react(), webguardApp(",
  );
  await expect(page.locator("#setup-policy-note")).toContainText("강제");
  await expect(page.locator("#setup-code")).not.toContainText(
    "trustedTypes: 'report-only'",
  );
  await page.getByLabel("설정 코드: 단축키 제한").uncheck();
  await page.getByLabel("설정 코드: 우클릭 제한").uncheck();
  await expect(page.locator("#setup-code")).toContainText(
    "blockShortcuts: false",
  );
  await expect(page.locator("#setup-code")).toContainText(
    "blockContextMenu: false",
  );
  await page.getByLabel("프로젝트 유형").selectOption("vanilla-string");
  await expect(page.locator("#setup-code")).toContainText(
    "trustedTypes: 'report-only'",
  );
  await expect(page.locator("#setup-policy-note")).toContainText(
    "차단하지 않습니다",
  );
  await expect(page.locator("#setup-code")).not.toContainText("react()");
  await expect(page.locator("#setup-install")).toContainText(
    "uulab-webguard-0.3.0.tgz",
  );
  await expect(page.locator("#setup-install")).not.toContainText(
    "uulab-webguard@0.3.0",
  );
  await expect(page.locator("#runtime-state")).toContainText("단축키 OFF");
  expect(errors).toEqual([]);
});

test("copies the selected configuration and keeps choices when integration tabs change", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copiedSetup = text;
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.getByLabel("프로젝트 유형")).toBeVisible({ timeout: 1500 });
  await page.getByLabel("프로젝트 유형").selectOption("vanilla-string");
  await page.getByLabel("설정 코드: 우클릭 제한").uncheck();
  await page
    .getByRole("button", { name: "적용 코드 복사", exact: true })
    .click();
  expect(await page.locator("html").getAttribute("data-copied-setup")).toBe(
    await page.locator("#setup-code").textContent(),
  );
  await page
    .getByRole("button", { name: "실시간 변경 코드", exact: true })
    .click();
  await expect(page.locator("#setup-options")).toBeHidden();
  await expect(page.locator("#setup-code")).toContainText(
    "getWebGuard()?.update",
  );
  await page.getByRole("button", { name: "Vite 설정", exact: true }).click();
  await expect(page.locator("#setup-code")).toContainText(
    "trustedTypes: 'report-only'",
  );
  await expect(page.locator("#setup-code")).toContainText(
    "blockContextMenu: false",
  );
  await expect(page.locator("#copy-setup-status")).toBeEmpty();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("프로젝트 유형").selectOption("react");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
