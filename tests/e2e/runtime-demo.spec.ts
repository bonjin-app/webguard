import { expect, test, type Page } from "@playwright/test";

const examplePath = "/examples/vanilla-js/";
const manifestPath = `${examplePath}webguard-manifest.json`;

interface InputObservation {
  trusted: boolean;
  prevented: boolean;
}

async function observeNextInput(page: Page, type: "keydown" | "contextmenu") {
  // Await this synchronous setup before sending browser input. A pending evaluate Promise
  // does not guarantee that its listener was registered before another protocol command.
  await page.evaluate((eventType) => {
    const state = window as typeof window & {
      __webguardE2EInput?: InputObservation;
    };
    delete state.__webguardE2EInput;
    document.addEventListener(
      eventType,
      (event) => {
        // Read after every synchronous SDK listener has had a chance to prevent the event.
        queueMicrotask(() => {
          state.__webguardE2EInput = {
            trusted: event.isTrusted,
            prevented: event.defaultPrevented,
          };
        });
      },
      { once: true },
    );
  }, type);
}

function inputObservation(page: Page) {
  return page.evaluate(
    () =>
      (window as typeof window & { __webguardE2EInput?: InputObservation })
        .__webguardE2EInput,
  );
}

test("shows the live SDK controls in the initial viewport and applies both policy buttons", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#live-demo")).toBeInViewport();
  await expect(page.locator("#shortcuts")).not.toBeChecked();
  await expect(page.locator("#context")).not.toBeChecked();
  await expect(page.locator("#sdk-integrity")).toBeChecked();

  await page
    .getByRole("button", { name: "입력 제한 켜기", exact: true })
    .click();
  await expect(page.locator("#shortcuts")).toBeChecked();
  await expect(page.locator("#context")).toBeChecked();
  await page
    .getByRole("button", { name: "입력 제한 끄기", exact: true })
    .click();
  await expect(page.locator("#shortcuts")).not.toBeChecked();
  await expect(page.locator("#context")).not.toBeChecked();
});

test("blocks actual F12 and right-click input outside an editor while preserving editable context menus", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "입력 제한 켜기", exact: true })
    .click();
  const target = page.getByLabel("본문 시험 영역", { exact: true });
  const result = page.locator("#runtime-input-result");
  await expect(target).toHaveAttribute("id", "runtime-target");
  await expect(target).toHaveAttribute("tabindex", "0");
  await target.focus();
  // Playwright keyboard/mouse input reaches the SDK as browser input, not dispatchEvent fixtures.
  // This checks page event prevention; it does not infer whether a DevTools window is open.
  await observeNextInput(page, "keydown");
  await page.keyboard.press("F12");
  await expect
    .poll(() => inputObservation(page))
    .toEqual({ trusted: true, prevented: true });
  await expect(result).toContainText("실제 입력");
  await expect(result).toContainText("차단됨");

  await observeNextInput(page, "contextmenu");
  await target.click({ button: "right" });
  await expect
    .poll(() => inputObservation(page))
    .toEqual({ trusted: true, prevented: true });
  await expect(result).toContainText("실제 입력");
  await expect(result).toContainText("차단됨");

  const editor = page.getByLabel("편집 허용 시험 입력", { exact: true });
  await expect(editor).toHaveAttribute("id", "runtime-editor");
  await editor.fill("편집할 수 있는 입력입니다.");
  await observeNextInput(page, "contextmenu");
  await editor.click({ button: "right" });
  await expect
    .poll(() => inputObservation(page))
    .toEqual({ trusted: true, prevented: false });
  await expect(result).toContainText("허용됨");
  await expect(result).toContainText("입력 영역");
});

test("labels synthetic F12 trials honestly and caps then clears the local event history", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "입력 제한 켜기", exact: true })
    .click();
  const clear = page.getByRole("button", { name: "기록 지우기", exact: true });
  const entries = page.locator("#runtime-log li");
  await clear.click();
  await expect(entries).toHaveCount(0);
  const synthetic = page.getByRole("button", {
    name: "F12 시험 이벤트 실행",
    exact: true,
  });
  await synthetic.click();
  await expect(page.locator("#runtime-log")).toContainText("합성");
  for (let index = 0; index < 24; index++) await synthetic.click();
  await expect(entries).toHaveCount(20);
  await clear.click();
  await expect(entries).toHaveCount(0);
});

test("checks a real manifest and file through the SDK with matching and different expected hashes", async ({
  page,
}) => {
  await page.goto("/");
  // Pass through unchanged bytes, while disabling browser HTTP caching for this
  // network-observation assertion. Cached SDK reads are valid product behavior.
  await page.route(`**${examplePath}**`, (route) => route.continue());
  await expect(page.locator("#sdk-integrity")).toBeChecked();
  const fileResponses: string[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith(examplePath) && path !== manifestPath && response.ok())
      fileResponses.push(path);
  });
  const manifestResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === manifestPath,
  );
  await page
    .getByRole("button", { name: "SDK 파일 검사", exact: true })
    .click();
  const manifest = await manifestResponse;
  expect(manifest.ok()).toBe(true);
  const data = (await manifest.json()) as {
    files: Record<string, { integrity: string }>;
  };
  const result = page.locator("#runtime-integrity-result");
  await expect(result).toContainText("정상 해시: 일치");
  await expect(result).toContainText("다른 기대 해시: 불일치");
  // Both checks must fetch a manifest-listed resource, rather than print a canned result.
  await expect.poll(() => fileResponses.length).toBeGreaterThanOrEqual(2);
  for (const path of fileResponses) {
    const record =
      data.files[decodeURIComponent(path.slice(examplePath.length))];
    expect(record?.integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
  }
});

test("reports a real mismatch when the manifest-listed SDK file response is changed", async ({
  page,
}) => {
  await page.goto("/");
  let changedFiles = 0;
  await page.route(`**${examplePath}**`, async (route) => {
    if (new URL(route.request().url()).pathname === manifestPath) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    changedFiles++;
    await route.fulfill({
      response,
      body: Buffer.concat([
        await response.body(),
        Buffer.from("\n/* runtime integrity regression: changed bytes */"),
      ]),
    });
  });
  await page
    .getByRole("button", { name: "SDK 파일 검사", exact: true })
    .click();
  await expect(page.locator("#runtime-integrity-result")).toContainText(
    "정상 해시: 불일치",
  );
  await expect(page.locator("#runtime-integrity-result")).toContainText(
    "다른 기대 해시: 불일치",
  );
  expect(changedFiles).toBeGreaterThanOrEqual(2);
});

test("does not request any resource when the SDK integrity policy is disabled", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#sdk-integrity").uncheck();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page
    .getByRole("button", { name: "SDK 파일 검사", exact: true })
    .click();
  await expect(page.locator("#runtime-integrity-result")).toHaveText(
    "무결성 검사가 꺼져 있습니다.",
  );
  expect(requests).toEqual([]);
});

test("runs the complete feature tour with real SDK, scenario, and High protection results", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "전체 기능 체험 시작", exact: true })
    .click();
  await expect(page.locator("#shortcuts")).toBeChecked();
  await expect(page.locator("#context")).toBeChecked();
  await expect(page.locator("#runtime-integrity-result")).toContainText(
    "정상 해시: 일치",
  );
  await expect(page.locator("#runtime-integrity-result")).toContainText(
    "다른 기대 해시: 불일치",
  );
  await expect(page.locator("#lab-summary")).toContainText("5개 체험 완료", {
    timeout: 30000,
  });
  await expect(page.locator("#policy-summary")).toContainText("비교 완료");
  await expect(page.locator("#compat-summary")).toHaveAttribute(
    "data-result",
    "pass",
  );
  await expect(page.locator("#equivalence")).toHaveText("Outputs match", {
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "High", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  if (process.env.WEBGUARD_PUBLIC_URL && browserName === "chromium") {
    await page
      .locator("#live-demo")
      .screenshot({ path: "docs/evidence/runtime-demo.png" });
  }
});
