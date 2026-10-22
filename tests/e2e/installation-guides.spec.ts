import { expect, test } from "@playwright/test";

const routes = [
  ["Vite · React / Vue", "VITE"],
  ["Next.js", "NEXT"],
  ["Webpack · esbuild", "STATIC"],
  ["HTML · jQuery", "HTML"],
  ["Java · JSP / Servlet", "JAVA"],
  ["Python · WSGI", "PYTHON"],
  ["PHP", "PHP"],
  ["CDN · 직접 다운로드", "CDN"],
] as const;

test("installation starts with an environment choice before downloads and details", async ({
  page,
}) => {
  await page.goto("/docs/#install");
  const chooser = page.locator("#install");
  await expect(
    chooser.getByRole("heading", { name: "사용하는 환경을 선택하세요" }),
  ).toBeVisible();
  for (const [label, route] of routes) {
    await expect(
      chooser.getByRole("link", { name: label, exact: false }),
    ).toHaveAttribute("href", `/docs/START_${route}.ko.html`);
  }
  expect(
    await page.evaluate(() =>
      Boolean(
        document
          .querySelector("#install")!
          .compareDocumentPosition(document.querySelector("#sdk-downloads")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const link of await chooser.locator(".installation-choice").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

for (const [label, route] of routes) {
  test(`${route} opens its own step-by-step guide from the chooser`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/docs/#install");
    await page
      .locator("#install")
      .getByRole("link", { name: label, exact: false })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/docs/START_${route}\\.ko\\.html$`),
    );
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForLoadState("load");
    expect(
      (await page.locator(".docs-outline").boundingBox())!.height,
    ).toBeLessThan(180);
    await expect(page.locator("h1")).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page
        .locator("h2")
        .filter({ hasText: /1[.) ]/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator("h2")
        .filter({ hasText: /2[.) ]/ })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "환경 선택으로 돌아가기", exact: true }),
    ).toBeVisible();
  });
}

test("existing direct install-code links reveal the detailed reference", async ({
  page,
}) => {
  await page.goto("/docs/#docs-install");
  await expect(page.locator("#docs-install")).toBeVisible();
  await expect(page.locator(".installation-reference")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator("#docs-install")).toBeInViewport();
});
