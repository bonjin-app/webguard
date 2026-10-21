import { expect, test } from "@playwright/test";

const tabs = ["브라우저 가드", "코드 난독화", "파일 검사", "고급 검사"];

test("starts with a quiet browser guard surface and preserves choices across keyboard navigation", async ({
  page,
}) => {
  await page.goto("/");
  const runtime = page.getByRole("tab", { name: tabs[0], exact: true });
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(runtime).toHaveAttribute("aria-selected", "true");
  await expect(runtime).toHaveJSProperty("tabIndex", 0);
  await expect(page.locator("#hero-heading")).toBeInViewport();
  await page.getByRole("link", { name: "데모 체험하기", exact: true }).click();
  await expect(page.locator("#live-demo")).toBeInViewport();
  await expect(page.locator("#runtime-target")).toBeVisible();
  await expect(page.locator("#shortcuts")).toBeVisible();
  await expect(page.locator("#context")).toBeVisible();
  await expect(page.locator("#runtime-advanced")).not.toHaveAttribute("open");
  await expect(page.locator("#runtime-enable")).toBeHidden();
  await expect(page.locator("#runtime-log")).toBeHidden();
  await expect(page.locator("#try-examples")).toBeHidden();
  await expect(page.locator("#sdk-file")).toBeHidden();
  await expect(page.locator("#security-lab")).toBeHidden();
  await expect(page.locator(".setup-details")).not.toHaveAttribute("open");

  await page.locator("#shortcuts").check();
  await runtime.focus();
  await page.keyboard.press("ArrowRight");
  const obfuscation = page.getByRole("tab", { name: tabs[1], exact: true });
  await expect(obfuscation).toBeFocused();
  await expect(obfuscation).toHaveAttribute("aria-selected", "true");
  await expect(runtime).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#try-examples")).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: tabs[3], exact: true }),
  ).toBeFocused();
  await expect(page.locator("#security-lab")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: tabs[2], exact: true }),
  ).toBeFocused();
  await expect(page.locator("#sdk-file")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(runtime).toBeFocused();
  await expect(runtime).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#shortcuts")).toBeChecked();
  await expect(page.locator("#runtime-advanced")).not.toHaveAttribute("open");
});

test("routes existing deep links to their tabs and opens setup disclosures", async ({
  page,
}) => {
  for (const [hash, tab] of [
    ["try-examples", "코드 난독화"],
    ["policy-lab", "고급 검사"],
    ["security-lab", "고급 검사"],
    ["resource-exposure", "고급 검사"],
    ["compatibility-lab", "고급 검사"],
    ["sdk-file", "파일 검사"],
  ]) {
    await page.goto(`/#${hash}`);
    await expect(
      page.getByRole("tab", { name: tab, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`#${hash}`)).toBeVisible();
  }
  for (const hash of ["setup", "app-examples"]) {
    await page.goto(`/#${hash}`);
    await expect(page.locator(".setup-details")).toHaveAttribute("open", "");
    await expect(page.locator(`#${hash}`)).toBeVisible();
  }

  await page.goto("/");
  await page.locator("#context").check();
  await page.evaluate(() => {
    window.location.hash = "sdk-file";
  });
  await expect(
    page.getByRole("tab", { name: "파일 검사", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "브라우저 가드", exact: true }).click();
  await expect(page.locator("#context")).toBeChecked();
});

test("allows every tab to be selected without overflowing a 390px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const name of tabs) {
    const tab = page.getByRole("tab", { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
