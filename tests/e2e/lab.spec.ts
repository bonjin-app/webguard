import { expect, test } from "@playwright/test";
test("executes real policy, integrity and server tampering scenarios", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "전체 시나리오 실행" }).click();
  await expect(page.locator("#lab-policy-result")).toContainText(
    "보호 적용: 차단 확인",
    { timeout: 20000 },
  );
  await expect(page.locator("#lab-policy-result")).toContainText(
    "보호 전: 실행됨",
  );
  await expect(page.locator("#lab-integrity-result")).toContainText(
    "변조본: 불일치",
  );
  await expect(page.locator("#lab-api-result")).toContainText(
    "정상 요청: HTTP 200",
  );
  await expect(page.locator("#lab-api-result")).toContainText(
    "변조 요청: HTTP 409",
  );
  await expect(page.locator("#lab-summary")).toContainText("5개 체험 완료");
  await expect(page.locator("#lab-network-result")).toContainText(
    "보호 전: 응답 확인",
  );
  await expect(page.locator("#lab-network-result")).toContainText(
    "보호 적용: 차단 확인",
  );
  const trustedTypesSupported = await page.evaluate(
    () =>
      typeof (
        globalThis as typeof globalThis & {
          trustedTypes?: { createPolicy?: unknown };
        }
      ).trustedTypes?.createPolicy === "function",
  );
  if (trustedTypesSupported) {
    await expect(page.locator("#lab-trusted-types-result")).toContainText(
      "보호 전: DOM 삽입됨",
    );
    await expect(page.locator("#lab-trusted-types-result")).toContainText(
      "보호 적용: 차단 확인",
    );
    await expect(page.locator("#lab-summary")).toContainText("5개 검증 확인");
  } else {
    await expect(page.locator("#lab-trusted-types-result")).toContainText(
      "미지원",
    );
    await expect(page.locator("#lab-summary")).toContainText("4개 검증 확인");
    await expect(page.locator("#lab-summary")).toContainText("1개 미지원");
  }
  await expect(page.locator("#lab-frames iframe")).toHaveCount(0);
  if (process.env.WEBGUARD_PUBLIC_URL && browserName === "chromium")
    await page
      .locator("#security-lab")
      .screenshot({ path: "docs/evidence/security-lab.png" });
});
test("checks eval and inline handlers under CSP and resets local results", async ({
  page,
}) => {
  await page.goto("/");
  for (const scenario of ["eval", "handler"]) {
    await page.getByLabel("스크립트 시험 종류").selectOption(scenario);
    await page.getByRole("button", { name: "스크립트 삽입 비교" }).click();
    await expect(page.locator("#lab-policy-result")).toContainText(
      "보호 적용: 차단 확인",
    );
    await expect(page.locator("#lab-policy-result")).toContainText(
      "보호 전: 실행됨",
    );
  }
  await page.getByLabel("서버에 보낼 가격").fill("9900");
  await page.getByRole("button", { name: "가격 요청 비교" }).click();
  await expect(page.locator("#lab-api-result")).toContainText(
    "입력 요청: HTTP 200",
  );
  await page.getByLabel("서버에 보낼 가격").fill("100");
  await page.getByRole("button", { name: "가격 요청 비교" }).click();
  await expect(page.locator("#lab-api-result")).toContainText(
    "변조 요청: HTTP 409",
  );
  await page.getByRole("button", { name: "체험 초기화" }).click();
  await expect(page.locator("#lab-api-result")).toHaveText(
    "아직 실행하지 않았습니다.",
  );
});
test("does not accept forged scenario messages or execute user markup", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    window.postMessage(
      {
        type: "webguard-lab",
        token: "fake",
        executed: true,
        violations: ["fake"],
      },
      "*",
    ),
  );
  await expect(page.locator("#lab-policy-result")).toHaveText(
    "아직 실행하지 않았습니다.",
  );
  await page
    .getByLabel("검사할 파일 내용")
    .fill('<img src=x onerror="alert(1)">');
  await page.getByRole("button", { name: "파일 변조 검사" }).click();
  await expect(page.locator("#lab-integrity-result")).toContainText(
    "변조본: 불일치",
  );
  await expect(page.locator("#lab-integrity-result img")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("reports a network failure without claiming verification success and permits retry", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/api/demo/quote", (route) => route.abort());
  await page.getByRole("button", { name: "가격 요청 비교" }).click();
  await expect(page.locator("#lab-api-result")).toContainText("시험 실패:");
  await expect(page.locator("#lab-summary")).toContainText("0개 검증 확인");
  await expect(
    page.getByRole("button", { name: "가격 요청 비교" }),
  ).toBeEnabled();
  await page.unroute("**/api/demo/quote");
  await page.getByRole("button", { name: "가격 요청 비교" }).click();
  await expect(page.locator("#lab-api-result")).toContainText(
    "변조 요청: HTTP 409",
  );
});

test("compares actual network responses against connect-src blocking and fails closed without a baseline", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "네트워크 요청 비교", exact: true })
    .click();
  const result = page.locator("#lab-network-result");
  await expect(result).toContainText("보호 전: 응답 확인");
  await expect(result).toContainText("보호 적용: 차단 확인");
  await expect(result).toContainText("connect-src");
  await expect(page.locator("#lab-summary")).toContainText("1개 검증 확인");
  await expect(page.locator("#lab-frames iframe")).toHaveCount(0);

  await page.route("**/api/demo/network-probe", (route) => route.abort());
  await page
    .getByRole("button", { name: "네트워크 요청 비교", exact: true })
    .click();
  await expect(result).toContainText("보호 전: 응답 확인 실패");
  await expect(result).not.toContainText("보호 적용: 차단 확인");
  await expect(page.locator("#lab-summary")).toContainText("0개 검증 확인");
  await expect(
    page.getByRole("button", { name: "네트워크 요청 비교", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("#lab-frames iframe")).toHaveCount(0);
});

test("compares actual innerHTML assignment with Trusted Types enforcement or reports unsupported explicitly", async ({
  page,
}) => {
  await page.goto("/");
  const supported = await page.evaluate(
    () =>
      typeof (
        globalThis as typeof globalThis & {
          trustedTypes?: { createPolicy?: unknown };
        }
      ).trustedTypes?.createPolicy === "function",
  );
  await page
    .getByRole("button", { name: "DOM 삽입 비교", exact: true })
    .click();
  const result = page.locator("#lab-trusted-types-result");
  if (supported) {
    await expect(result).toContainText("보호 전: DOM 삽입됨");
    await expect(result).toContainText("보호 적용: 차단 확인");
    await expect(result).toContainText("require-trusted-types-for");
    await expect(result).toContainText("TypeError");
    await expect(page.locator("#lab-summary")).toContainText("1개 검증 확인");
  } else {
    await expect(result).toContainText("미지원");
    await expect(result).not.toContainText("차단 확인");
    await expect(page.locator("#lab-summary")).toContainText("0개 검증 확인");
    await expect(page.locator("#lab-summary")).toContainText("1개 미지원");
  }
  await expect(page.locator("#lab-frames iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "체험 초기화", exact: true }).click();
  await expect(result).toHaveText("아직 실행하지 않았습니다.");
  await expect(page.locator("#lab-network-result")).toHaveText(
    "아직 실행하지 않았습니다.",
  );
});

test("never counts an unavailable Trusted Types API as successful verification", async ({
  page,
}) => {
  // Exercise capability fallback even on engines that provide Trusted Types.
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "trustedTypes", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "DOM 삽입 비교", exact: true })
    .click();
  await expect(page.locator("#lab-trusted-types-result")).toContainText(
    "미지원",
  );
  await expect(page.locator("#lab-trusted-types-result")).not.toContainText(
    "차단 확인",
  );
  await expect(page.locator("#lab-summary")).toContainText("0개 검증 확인");
  await expect(page.locator("#lab-summary")).toContainText("1개 미지원");
  await expect(page.locator("#lab-frames iframe")).toHaveCount(0);
});
