import { expect, test } from "@playwright/test";

const guides = [
  ["INSTALL.ko", "WebGuard 0.3.0 로컬 후보 검토·적용 가이드"],
  ["ENVIRONMENTS.ko", "환경별 WebGuard 적용"],
  ["SSR_VERIFICATION", "SSR와 환경별 보호 검증"],
] as const;

test("opens complete guides from the Korean documentation home", async ({
  page,
}) => {
  await page.goto("/docs/");
  await page
    .locator("#complete-guides")
    .getByRole("link", { name: "설치·적용 전체 가이드" })
    .click();
  await expect(page).toHaveURL(/\/docs\/INSTALL\.ko\.html$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    guides[0][1],
  );
  await page
    .getByRole("link", { name: "환경별 적용 가이드", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/ENVIRONMENTS\.ko\.html$/);
  await expect(
    page.getByRole("link", { name: "설치 가이드", exact: true }),
  ).toHaveAttribute(
    "href",
    "/docs/INSTALL.ko.html#9-선택-기능-css-식별자와-런타임-신호",
  );
  await page.getByRole("link", { name: "설치 가이드", exact: true }).click();
  await expect(
    page.locator("h2").filter({ hasText: "9. 선택 기능" }),
  ).toBeInViewport();
});

for (const [name, title] of guides) {
  test(`${name} is a complete styled static guide with text download`, async ({
    browser,
    baseURL,
    request,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL,
      viewport: { width: 390, height: 844 },
    });
    try {
      const page = await context.newPage();
      const response = await page.goto(`/docs/${name}.html`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator(".docs-header")).toHaveCSS(
        "background-color",
        "rgb(237, 248, 255)",
      );
      await expect(page.locator("script")).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "원문 .txt 다운로드" }),
      ).toHaveAttribute("download", "");
      const text = await request.get(`/docs/${name}.txt`);
      expect(text.status()).toBe(200);
      expect(await text.text()).toContain(`# ${title}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const brokenLocalMarkdown = await page
        .locator('a[href$=".md"]:not([href^="https://"])')
        .count();
      expect(brokenLocalMarkdown).toBe(0);
    } finally {
      await context.close();
    }
  });
}
