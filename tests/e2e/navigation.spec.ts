import { expect, test } from "@playwright/test";

test("opens /demo directly on operable controls and preserves the home introduction", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/demo");
  await expect(page.locator("#demo-heading")).toHaveJSProperty("tagName", "H1");
  await expect(page.locator("#demo-heading")).toBeInViewport();
  for (const id of ["runtime-page-block", "shortcuts", "context"])
    await expect(page.locator(`#${id}`)).toBeInViewport({ ratio: 1 });
  await expect(page.locator("#shortcuts")).toBeEnabled();
  await expect(page.locator(".sdk-hero")).toBeHidden();
  await expect(page.locator("#sdk-strengths")).toBeHidden();
  await expect(page.locator("#deployment-proof")).toBeHidden();
  await expect(page.locator("#developer-resources")).toBeHidden();
  expect(
    await page
      .locator("#sdk-demo")
      .evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(document.querySelector(".sdk-hero")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true);
  await page.locator("#runtime-page-block").uncheck();
  await page.locator("#shortcuts").uncheck();
  await page.locator("#test-mac-inspect").click();
  await expect(page.locator("#live-result")).toContainText("허용됨");
  await page.goto("/");
  await expect(page).toHaveURL(new URL("/", page.url()).href);
  await expect(page.locator("#hero-heading")).toHaveJSProperty("tagName", "H1");
  await expect(page.locator("#hero-heading")).toBeInViewport();
});

const tabs = ["브라우저 가드", "코드 난독화", "파일 검사", "고급 검사"];

test("opens public code inspection and real security comparisons directly from the protection overview", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "이 데모 코드 검사", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "고급 검사", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#resource-summary")).toHaveAttribute(
    "data-result",
    "pass",
  );
  const entry = await page
    .locator('script[type="module"][src]')
    .first()
    .getAttribute("src");
  const response = await page.request.get(new URL(entry!, page.url()).href);
  expect(response.ok()).toBe(true);
  await expect(page.locator("#resource-code")).toHaveText(
    (await response.text()).slice(0, 900),
  );
  await page.goto("/#deployment-proof");
  await page
    .getByRole("link", { name: "삽입·변조 비교 실행", exact: true })
    .click();
  await expect(page.locator("#lab-summary")).toContainText("5개 체험 완료");
  await expect(page.locator("#lab-policy-result")).toContainText(
    "보호 적용: 차단 확인",
  );
  await expect(page.locator("#lab-api-result")).toContainText(
    "변조 요청: HTTP 409",
  );
});

test("starts with a quiet browser guard surface and preserves choices across keyboard navigation", async ({
  page,
}) => {
  await page.goto("/");
  const runtime = page.getByRole("tab", { name: tabs[0], exact: true });
  await expect(page.locator("#landing-live-demo")).not.toHaveAttribute("open");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(
    page.locator(
      new URL(page.url()).pathname === "/demo"
        ? "#demo-heading"
        : "#hero-heading",
    ),
  ).toBeInViewport();
  await page.getByRole("link", { name: "데모 체험하기", exact: true }).click();
  await expect(page.locator("#landing-live-demo")).toHaveAttribute("open");
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(runtime).toHaveAttribute("aria-selected", "true");
  await expect(runtime).toHaveJSProperty("tabIndex", 0);
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

  await page.locator("#runtime-page-block").uncheck();
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
  await expect(page.locator("#policy-lab")).toBeVisible();
  await expect(page.locator("#security-lab")).toBeHidden();
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

test("advanced labs show one scenario at a time and preserve results across navigation", async ({
  page,
}) => {
  await page.goto("/demo#security-lab");
  const navigation = page.getByRole("navigation", { name: "고급 검사 선택" });
  await expect(page.locator("#security-lab")).toBeVisible();
  await expect(page.locator("#policy-lab")).toBeHidden();
  await page.locator("#lab-all").click();
  await expect(page.locator("#lab-summary")).toContainText("5개 체험 완료");
  await navigation
    .getByRole("link", { name: "리소스 공개 검사", exact: true })
    .click();
  await expect(page.locator("#resource-exposure")).toBeVisible();
  await expect(page.locator("#security-lab")).toBeHidden();
  await expect(
    navigation.getByRole("link", { name: "리소스 공개 검사", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  await page.getByRole("tab", { name: "브라우저 가드", exact: true }).click();
  await page.getByRole("tab", { name: "고급 검사", exact: true }).click();
  await expect(page.locator("#resource-exposure")).toBeVisible();
  await navigation
    .getByRole("link", { name: "삽입·변조 시나리오", exact: true })
    .click();
  await expect(page.locator("#lab-summary")).toContainText("5개 체험 완료");
});

test("runtime diagnosis has readable feature states before its optional raw snapshot", async ({
  page,
}) => {
  await page.goto("/demo#runtime-diagnostics");
  await expect(page.locator("#runtime-diagnostics")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator('[data-runtime-feature="shortcuts"]')).toHaveText(
    "입력 수신 중",
  );
  await expect(page.locator("#runtime-status-raw")).not.toHaveAttribute("open");
  await page.locator("#runtime-page-block").uncheck();
  await page.locator("#shortcuts").uncheck();
  await expect(page.locator('[data-runtime-feature="shortcuts"]')).toHaveText(
    "꺼짐",
  );
  await page.locator("#runtime-status-raw > summary").click();
  await expect(page.locator("#runtime-status")).toBeVisible();
  expect(
    JSON.parse((await page.locator("#runtime-status").textContent())!).features
      .shortcuts,
  ).toBe("off");
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

  await page.goto("/#live-demo");
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
  await page.goto("/#live-demo");
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
