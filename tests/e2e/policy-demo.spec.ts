import { expect, test } from "@playwright/test";

test("compares all policies, mixed settings and all-off using real sandbox operations", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await expect(page.locator("#policy-summary")).toContainText("실행 전");
  expect(await page.locator("#policy-lab iframe").count()).toBe(0);
  await page.locator("#policy-run").click();
  await expect(page.locator("#policy-before")).toContainText("네트워크: 허용");
  await expect(page.locator("#policy-after")).toContainText("네트워크: 차단");
  await expect(page.locator("#policy-after")).toContainText("인라인: 차단");
  await expect(page.locator("#policy-after")).toContainText(
    /DOM: 차단|DOM: 미지원/,
  );
  await expect(page.locator("#policy-summary")).toContainText("비교 완료");
  if (process.env.WEBGUARD_PUBLIC_URL && browserName === "chromium")
    await page
      .locator("#policy-lab")
      .screenshot({ path: "docs/evidence/policy-switches-on.png" });
  await page.locator("#policy-network").uncheck();
  await expect(page.locator("#policy-summary")).toContainText("다시 실행");
  await page.locator("#policy-run").click();
  await expect(page.locator("#policy-after")).toContainText("네트워크: 허용");
  await expect(page.locator("#policy-after")).toContainText("인라인: 차단");
  await page.locator("#policy-disable-all").click();
  await page.locator("#policy-run").click();
  await expect(page.locator("#policy-after")).toContainText("네트워크: 허용");
  await expect(page.locator("#policy-after")).toContainText("DOM: 허용");
  await expect(page.locator("#policy-after")).toContainText("인라인: 허용");
  await expect(page.locator("#policy-summary")).toContainText("비교 완료");
  const comparisonWidth = await page
    .locator("#policy-lab .sample-grid")
    .evaluate(
      (grid) =>
        grid.getBoundingClientRect().width / grid.parentElement!.clientWidth,
    );
  expect(comparisonWidth).toBeGreaterThan(0.9);
  if (process.env.WEBGUARD_PUBLIC_URL && browserName === "chromium")
    await page
      .locator("#policy-lab")
      .screenshot({ path: "docs/evidence/policy-switches-off.png" });
  await page.locator("#policy-enable-all").click();
  await expect(page.locator("#policy-network")).toBeChecked();
  await expect(page.locator("#policy-dom")).toBeChecked();
  await expect(page.locator("#policy-inline")).toBeChecked();
  expect(await page.locator("#policy-lab iframe").count()).toBe(0);
});

test("reports failed baseline networking instead of claiming a successful block and ignores forged messages", async ({
  page,
}) => {
  await page.route("**/api/demo/network-probe", (route) => route.abort());
  await page.goto("/");
  await page.locator("#policy-run").click();
  await page.evaluate(() =>
    window.postMessage(
      {
        type: "webguard-policy-result",
        token: "forged",
        result: {
          network: "allowed",
          dom: "allowed",
          inline: "allowed",
          trustedTypes: true,
          violations: [],
        },
      },
      "*",
    ),
  );
  await expect(page.locator("#policy-summary")).toContainText(
    "네트워크 확인 실패",
  );
  await expect(page.locator("#policy-before")).toContainText(
    "네트워크: 확인 실패",
  );
  await expect(page.locator("#policy-run")).toBeEnabled();
  expect(await page.locator("#policy-lab iframe").count()).toBe(0);
});

test("cancels pending frames on pagehide and can run again after page restoration", async ({
  page,
}) => {
  let releaseRequest!: () => void;
  let observeRequest!: () => void;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  const requestObserved = new Promise<void>((resolve) => {
    observeRequest = resolve;
  });
  let firstRequest = true;
  await page.route("**/api/demo/network-probe", async (route) => {
    if (!firstRequest) {
      await route.continue();
      return;
    }
    firstRequest = false;
    observeRequest();
    await requestGate;
    // pagehide removes the requesting iframe; settle its held route as well.
    await route.abort().catch(() => {});
  });
  try {
    await page.goto("/");
    await page.locator("#policy-run").click();
    await requestObserved;
    await expect(page.locator("#policy-lab iframe").first()).toBeAttached();
    await expect(page.locator("#policy-run")).toBeDisabled();
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      ),
    );
    releaseRequest();
    await expect(page.locator("#policy-run")).toBeEnabled();
    await expect(page.locator("#policy-summary")).toContainText("중단");
    expect(await page.locator("#policy-lab iframe").count()).toBe(0);
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    await page.locator("#policy-run").click();
    await expect(page.locator("#policy-summary")).toContainText("비교 완료");
  } finally {
    releaseRequest();
  }
});
