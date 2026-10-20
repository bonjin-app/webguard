import { expect, test } from "@playwright/test";

test("loads valid brand icons and starts without application or resource errors", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("#runtime-state")).toContainText("단축키 OFF");
  for (const [path, mime] of [
    ["/favicon.ico", "image/x-icon"],
    ["/favicon.svg", "image/svg+xml"],
  ]) {
    const response = await request.get(path!);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"]).toContain(mime);
    const bytes = await response.body();
    if (path!.endsWith(".ico"))
      expect([...bytes.subarray(0, 6)]).toEqual([0, 0, 1, 0, 1, 0]);
    else
      expect(bytes.toString()).toContain(
        '<svg xmlns="http://www.w3.org/2000/svg"',
      );
  }
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );
  const dimensions = await page.evaluate(() =>
    Promise.all(
      ["/favicon.ico", "/favicon.svg"].map(
        (src) =>
          new Promise<number[]>((resolve, reject) => {
            const icon = new Image();
            icon.onload = () =>
              resolve([icon.naturalWidth, icon.naturalHeight]);
            icon.onerror = () =>
              reject(new Error("Icon decode failed: " + src));
            icon.src = src;
          }),
      ),
    ),
  );
  expect(dimensions).toEqual([
    [32, 32],
    [32, 32],
  ]);
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

test("explains intentional CSP and 409 diagnostics without uncaught app errors", async ({
  page,
  browserName,
}) => {
  const uncaught: string[] = [];
  const unexpectedConsole: string[] = [];
  page.on("pageerror", (error) => uncaught.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text(),
      url = message.location().url;
    const expectedPolicy =
      /Content.?Security.?Policy|script-src/.test(text) &&
      (!url || url.startsWith("about:srcdoc"));
    const expectedQuote =
      url.endsWith("/api/demo/quote") && text.includes("409");
    if (!expectedPolicy && !expectedQuote)
      unexpectedConsole.push(`${url}: ${text}`);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "전체 기능 체험 시작" }).click();
  await expect(page.locator("#lab-summary")).toContainText("3개 검증 확인", {
    timeout: 30000,
  });
  await expect(page.locator("#equivalence")).toHaveText("Outputs match");
  await expect(page.locator("#runtime-integrity-result")).toContainText(
    "정상 해시: 일치",
  );
  await expect(page.locator("#lab-console-guide")).toContainText(
    "예상된 시험 로그",
  );
  await expect(page.locator("#lab-policy-result")).toContainText(
    "예상된 CSP 차단",
  );
  await expect(page.locator("#lab-api-result")).toContainText(
    "예상된 HTTP 409",
  );
  expect(uncaught).toEqual([]);
  expect(unexpectedConsole).toEqual([]);
  if (process.env.WEBGUARD_PUBLIC_URL && browserName === "chromium")
    await page
      .locator("#security-lab")
      .screenshot({ path: "docs/evidence/demo-diagnostics.png" });
});

test("does not label server faults as expected rejection", async ({ page }) => {
  await page.goto("/");
  await page.route("**/api/demo/quote", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Demo server fault" }),
    }),
  );
  await page.getByRole("button", { name: "가격 요청 비교" }).click();
  await expect(page.locator("#lab-api-result")).toContainText("HTTP 500");
  await expect(page.locator("#lab-api-result")).toContainText("예상 밖의 응답");
  await expect(page.locator("#lab-api-result")).not.toContainText(
    "예상된 HTTP 409",
  );
  await expect(page.locator("#lab-summary")).toContainText("0개 검증 확인");
});
