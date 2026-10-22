import { expect, test } from "@playwright/test";

test("protects locally, compares real output, and creates a local integrity report", async ({
  page,
  browserName,
}) => {
  await page.goto("/#try-examples");
  await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
  await expect(page.locator("#equivalence")).toHaveText("출력 일치", {
    timeout: 30000,
  });
  await expect(page.locator("#logs")).toContainText("Order total: 90");
  await expect(page.locator("#logs")).toContainText("With delivery: 95");
  expect(await page.locator("#output").inputValue()).not.toContain(
    "prices.reduce",
  );
  await expect(page.locator("#report")).toContainText(
    "로컬 결과 재검증: 해시 일치",
  );
  await expect(page.locator("#report")).toContainText("소스 맵: 비활성화");
  await expect(page.locator("#report")).toContainText(
    "이 해시는 로컬 결과의 일관성을 확인하며, 진위를 보장하지 않습니다.",
  );
  await expect(page.locator("#timing")).toContainText("ms");
  await expect(page.locator(".metrics")).toContainText(
    "각 1회 측정으로, 반복 성능 벤치마크가 아닙니다.",
  );
  await expect(page.locator("#size-change")).toContainText("%");
  if (browserName === "chromium") {
    await page.screenshot({
      path: process.env.WEBGUARD_PUBLIC_URL
        ? "docs/evidence/public-demo.png"
        : "docs/evidence/playground.png",
      fullPage: true,
    });
  }
  await page.getByRole("tab", { name: "브라우저 가드", exact: true }).click();
  await expect(page.getByLabel("Restrict context menu")).toBeChecked();
  await expect(
    page.getByLabel("Restrict F12 / inspect shortcuts"),
  ).toBeChecked();
});

test("rejects invalid JavaScript without executing it", async ({ page }) => {
  await page.goto("/#try-examples");
  await page
    .getByLabel("원본 JavaScript", { exact: true })
    .fill("const broken = ;");
  await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
  await expect(page.locator("#status")).toContainText("난독화 실패:", {
    timeout: 30000,
  });
  await expect(page.locator("#equivalence")).toHaveText("실행 전");
  await expect(page.locator("#output")).toHaveValue("");
});

test("terminates infinite execution and keeps the main app responsive", async ({
  page,
}) => {
  await page.goto("/#try-examples");
  await page
    .getByLabel("원본 JavaScript", { exact: true })
    .fill("while (true) {}");
  await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
  await expect(page.locator("#equivalence")).toHaveText("실행 오류", {
    timeout: 30000,
  });
  await expect(page.locator("#logs")).toContainText("Execution timed out");
  await expect(
    page.getByRole("button", { name: "난독화하고 비교하기" }),
  ).toBeEnabled();
  expect(await page.locator("iframe").count()).toBe(0);
});

test("blocks network requests from source and protected execution", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("webguard-test.invalid"))
      requests.push(request.url());
  });
  await page.goto("/#try-examples");
  await page
    .getByLabel("원본 JavaScript", { exact: true })
    .fill(
      `fetch('https://webguard-test.invalid/private').catch(() => {}); console.log('request attempted');`,
    );
  await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
  await expect(page.locator("#equivalence")).toHaveText("출력 일치", {
    timeout: 30000,
  });
  expect(requests).toEqual([]);
});

test("ignores forged window messages and prevents worker access to the page", async ({
  page,
}) => {
  await page.goto("/#try-examples");
  await page.evaluate(() =>
    window.postMessage(
      { token: "forged", result: { logs: ["FORGED"], elapsed: 0 } },
      "*",
    ),
  );
  await expect(page.locator("#logs")).not.toContainText("FORGED");
  await page
    .getByLabel("원본 JavaScript", { exact: true })
    .fill(
      `console.log(typeof document, typeof window); console.log('safe <img src=x onerror=alert(1)>');`,
    );
  await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
  await expect(page.locator("#equivalence")).toHaveText("출력 일치", {
    timeout: 30000,
  });
  await expect(page.locator("#logs")).toContainText("undefined undefined");
  expect(await page.locator("#logs img").count()).toBe(0);
});

test("has a usable narrow layout and accessible controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#try-examples");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "기본", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "기본", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("explains empty input and invalidates changed source in Korean", async ({
  page,
}) => {
  await page.goto("/#try-examples");
  await expect(page.getByRole("group", { name: "난독화 강도" })).toBeVisible();
  await expect(
    page.getByLabel("난독화한 JavaScript", { exact: true }),
  ).toHaveAttribute("placeholder", "난독화한 코드가 여기에 표시됩니다.");
  const source = page.getByLabel("원본 JavaScript", { exact: true });
  await source.fill("");
  await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
  await expect(page.locator("#status")).toHaveText(
    "1~100,000바이트의 JavaScript 코드를 입력하세요.",
  );
  await expect(page.locator("#status")).toHaveAttribute("aria-live", "polite");
  await source.fill("console.log('한국어 출력');");
  await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
  await expect(page.locator("#equivalence")).toHaveText("출력 일치", {
    timeout: 30000,
  });
  await source.fill("console.log('변경한 출력');");
  await expect(page.locator("#equivalence")).toHaveText("갱신 필요");
  await expect(page.locator("#status")).toContainText(
    "다시 난독화해 비교 결과를 갱신하세요.",
  );
});

test("preset result validity changes only when selecting a different preset", async ({
  page,
}) => {
  await page.goto("/#try-examples");
  await expect(page.locator("#preset-description")).toHaveText(
    "일반적인 빌드에 맞춘 균형 잡힌 문자열 보호입니다.",
  );
  await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
  await expect(page.locator("#equivalence")).toHaveText("출력 일치", {
    timeout: 30000,
  });
  const completedStatus = await page.locator("#status").textContent();
  await page.getByRole("button", { name: "표준", exact: true }).click();
  await expect(page.locator("#equivalence")).toHaveText("출력 일치");
  await expect(page.locator("#status")).toHaveText(completedStatus!);
  await page.getByRole("button", { name: "기본", exact: true }).click();
  await expect(page.locator("#equivalence")).toHaveText("갱신 필요");
  await expect(page.locator("#status")).toHaveText(
    "난독화 강도가 바뀌었습니다. 다시 난독화해 비교 결과를 갱신하세요.",
  );
  await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
  await expect(page.locator("#equivalence")).toHaveText("출력 일치", {
    timeout: 30000,
  });
  await expect(page.locator("#report")).toContainText("난독화 강도: 기본");
});
