import { expect, test, type Page } from "@playwright/test";

const examplePath = "/examples/vanilla-js/";
const manifestPath = `${examplePath}webguard-manifest.json`;

interface InputObservation {
  trusted: boolean;
  prevented: boolean;
}

async function observeNextInput(
  page: Page,
  type: "keydown" | "contextmenu",
  code?: string,
) {
  // Await synchronous listener setup before sending browser input. Modifier keydowns
  // must not satisfy observations intended for the final physical shortcut key.
  await page.evaluate(
    ({ eventType, expectedCode }) => {
      const state = window as typeof window & {
        __webguardE2EInput?: InputObservation;
        __webguardE2EInputCleanup?: () => void;
      };
      state.__webguardE2EInputCleanup?.();
      delete state.__webguardE2EInput;
      const cleanup = () => {
        document.removeEventListener(eventType, observe);
        delete state.__webguardE2EInputCleanup;
      };
      const observe = (event: Event) => {
        if (
          expectedCode &&
          (!(event instanceof KeyboardEvent) || event.code !== expectedCode)
        )
          return;
        cleanup();
        // Read after every synchronous SDK listener has had a chance to prevent the event.
        queueMicrotask(() => {
          state.__webguardE2EInput = {
            trusted: event.isTrusted,
            prevented: event.defaultPrevented,
          };
        });
      };
      state.__webguardE2EInputCleanup = cleanup;
      document.addEventListener(eventType, observe);
    },
    { eventType: type, expectedCode: code },
  );
}

function inputObservation(page: Page) {
  return page.evaluate(
    () =>
      (window as typeof window & { __webguardE2EInput?: InputObservation })
        .__webguardE2EInput,
  );
}

async function openBasicDemo(page: Page, path: string) {
  await page.goto(path);
  if (path === "/")
    await page
      .getByRole("link", { name: "데모 체험하기", exact: true })
      .click();
  // These scenarios exercise the basic non-editable policy explicitly. The
  // public site now starts in page protection mode, covered separately below.
  await page.locator("#runtime-page-block").uncheck();
}

test("reaches live SDK controls from the hero and applies both policy buttons", async ({
  page,
}) => {
  await openBasicDemo(page, "/");
  await page.locator("#hero-heading").scrollIntoViewIfNeeded();
  await expect(page.locator("#hero-heading")).toBeInViewport();
  await page.getByRole("link", { name: "데모 체험하기", exact: true }).click();
  await expect(page.locator("#live-demo")).toBeInViewport();
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
  await expect(page.locator("#shortcuts")).toBeChecked();
  await expect(page.locator("#context")).toBeChecked();
  await expect(page.locator("#sdk-integrity")).toBeChecked();
  await expect(page.locator("#runtime-state")).toContainText("단축키 ON");
  // Explicit basic mode isolates input cancellation from the default modal response.
  await page.getByLabel("본문 시험 영역", { exact: true }).focus();
  await observeNextInput(page, "keydown", "KeyI");
  await page.keyboard.press("Meta+Alt+KeyI");
  await expect
    .poll(() => inputObservation(page))
    .toEqual({
      trusted: true,
      prevented: true,
    });

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
  await openBasicDemo(page, "/");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
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

for (const [platform, modifiers] of [
  ["Mac", "Meta+Alt"],
  ["Windows", "Control+Shift"],
]) {
  test(`cancels actual ${platform} inspect shortcuts only while restrictions are enabled`, async ({
    page,
  }) => {
    await openBasicDemo(page, "/#live-demo");
    await page.locator("#runtime-advanced > summary").click();
    await page.locator("#runtime-events > summary").click();
    const target = page.getByLabel("본문 시험 영역", { exact: true });
    const result = page.locator("#runtime-input-result");
    const log = page.locator("#runtime-log");
    for (const enabled of [true, false]) {
      await page.locator("#shortcuts").setChecked(enabled);
      for (const code of ["KeyI", "KeyJ", "KeyC"]) {
        await page
          .getByRole("button", { name: "기록 지우기", exact: true })
          .click();
        await expect(log.locator("li")).toHaveCount(0);
        await target.focus();
        await observeNextInput(page, "keydown", code);
        // These are trusted browser key events. The assertion covers cancellation
        // when delivered to the page, not whether a DevTools window opens.
        await page.keyboard.press(`${modifiers}+${code}`);
        await expect
          .poll(() => inputObservation(page))
          .toEqual({
            trusted: true,
            prevented: enabled,
          });
        const outcome = enabled ? "차단됨" : "허용됨";
        await expect(result).toContainText("실제 입력 · 검사 단축키 · 본문");
        await expect(result).toContainText(outcome);
        await expect(log).toContainText("실제 입력 · 검사 단축키 · 본문");
        await expect(log).toContainText(outcome);
      }
    }
  });
}

test("labels synthetic F12 trials honestly and caps then clears the local event history", async ({
  page,
}) => {
  await openBasicDemo(page, "/");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
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
  const macSynthetic = page.getByRole("button", {
    name: "⌘+⌥+I 시험 이벤트 실행",
    exact: true,
  });
  await macSynthetic.click();
  await expect(page.locator("#live-result")).toContainText("⌘+⌥+I");
  await expect(page.locator("#live-result")).toContainText("차단됨");
  await expect(page.locator("#live-result")).toContainText("합성");
  await page.locator("#shortcuts").uncheck();
  await macSynthetic.click();
  await expect(page.locator("#live-result")).toContainText("허용됨");
  await clear.click();
  await expect(entries).toHaveCount(0);
});

test("checks a real manifest and file through the SDK with matching and different expected hashes", async ({
  page,
}) => {
  await openBasicDemo(page, "/");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
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
  await page.getByRole("tab", { name: "파일 검사", exact: true }).click();
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
  await openBasicDemo(page, "/");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
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
  await page.getByRole("tab", { name: "파일 검사", exact: true }).click();
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

test("does not request application resources when the SDK integrity policy is disabled", async ({
  page,
}) => {
  await openBasicDemo(page, "/");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
  await page.locator("#sdk-integrity").uncheck();
  const requests: string[] = [];
  page.on("request", (request) => {
    // The host can emit its own Cloudflare RUM beacon independently of the SDK.
    // Keep every application request in the assertion, including late images.
    const url = new URL(request.url());
    if (
      process.env.WEBGUARD_PUBLIC_URL &&
      url.origin === new URL(page.url()).origin &&
      url.pathname === "/cdn-cgi/rum"
    )
      return;
    requests.push(request.url());
  });
  await page.getByRole("tab", { name: "파일 검사", exact: true }).click();
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
  await openBasicDemo(page, "/");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
  for (const id of ["dom-block", "pause-block"])
    await page.locator(`#${id}`).check();
  await page
    .getByRole("button", { name: "전체 기능 체험 시작", exact: true })
    .click();
  await expect(page.locator("#runtime-tour")).toBeDisabled();
  await expect(page.locator("#dom-block")).not.toBeChecked();
  await expect(page.locator("#pause-block")).not.toBeChecked();
  await expect(page.locator("#dom-response-caption")).toContainText(
    "기록 모드",
  );
  await expect(page.locator("#pause-response-caption")).toContainText(
    "기록 모드",
  );
  await expect(page.locator("#runtime-tour-status")).toHaveAttribute(
    "data-state",
    "running",
  );
  // Re-entry from scripts or another listener must not start a second run.
  await page
    .locator("#runtime-tour")
    .evaluate((node) =>
      node.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
  await expect(page.locator("#shortcuts")).toBeChecked();
  await expect(page.locator("#context")).toBeChecked();
  await page.getByRole("tab", { name: "파일 검사", exact: true }).click();
  await expect(page.locator("#runtime-integrity-result")).toContainText(
    "정상 해시: 일치",
  );
  await expect(page.locator("#runtime-integrity-result")).toContainText(
    "다른 기대 해시: 불일치",
  );
  await page.getByRole("tab", { name: "고급 검사", exact: true }).click();
  await expect(page.locator("#lab-summary")).toContainText("5개 체험 완료", {
    timeout: 30000,
  });
  await expect(page.locator("#policy-summary")).toContainText("비교 완료");
  await expect(page.locator("#compat-summary")).toHaveAttribute(
    "data-result",
    "pass",
  );
  await page.getByRole("tab", { name: "코드 난독화", exact: true }).click();
  await expect(page.locator("#equivalence")).toHaveText("출력 일치", {
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "강력", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#runtime-tour-status")).toHaveAttribute(
    "data-state",
    "complete",
    { timeout: 15000 },
  );
  await expect(page.locator("#runtime-tour")).toBeEnabled();
  if (process.env.WEBGUARD_PUBLIC_URL && browserName === "chromium") {
    await page.getByRole("tab", { name: "브라우저 가드", exact: true }).click();
    await page
      .locator("#live-demo")
      .screenshot({ path: "docs/evidence/runtime-demo.png" });
  }
});

/** Simulate window geometry only; this is not evidence of real DevTools detection. */
async function useUndockedGeometry(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "outerWidth", {
      configurable: true,
      get: () => window.innerWidth,
    });
    Object.defineProperty(window, "outerHeight", {
      configurable: true,
      get: () => window.innerHeight,
    });
  });
}

test("default page protection cancels trusted Mac inspection input inside an editor and permits rechecking", async ({
  page,
}) => {
  await useUndockedGeometry(page);
  await page.goto("/#live-demo");
  const mode = page.locator("#runtime-page-block");
  await expect(mode).toBeChecked();
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
  await mode.check();
  await expect(page.locator("#shortcuts")).toBeChecked();
  await expect(page.locator("#shortcuts")).toBeEnabled();
  await expect(page.locator("#runtime-detect")).not.toBeChecked();
  await expect(page.locator("#runtime-detect")).toBeEnabled();
  await expect(page.locator("#runtime-warn")).toBeDisabled();
  await expect(page.locator("#runtime-config")).toContainText(
    '"shortcutScope": "page"',
  );
  await page
    .locator("#runtime-editor")
    .fill("페이지 보호 모드에서도 일반 편집은 가능합니다.");
  await observeNextInput(page, "keydown", "KeyI");
  await page.keyboard.press("Meta+Alt+KeyI");
  await expect
    .poll(() => inputObservation(page))
    .toEqual({ trusted: true, prevented: true });
  const blocker = page.locator("dialog[data-webguard-blocker]");
  await expect(blocker).toBeVisible();
  await expect(blocker).toHaveAccessibleName("검사 단축키 입력을 감지했습니다");
  await expect(
    blocker.getByRole("heading", {
      name: "검사 단축키 입력을 감지했습니다",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    blocker.getByRole("button", { name: "확인 후 계속", exact: true }),
  ).toBeVisible();
  await expect(blocker).not.toContainText("개발자도구를 닫아 주세요");
  await expect(blocker).toHaveJSProperty("open", true);
  expect(await blocker.evaluate((node) => node.matches(":modal"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(blocker).toBeVisible();
  // Native modal owns focus and makes the application behind it inert.
  await page.locator("#runtime-editor").evaluate((node) => node.focus());
  await expect(page.locator("#runtime-editor")).not.toBeFocused();
  await expect(blocker.locator("[data-demo-block-exit]")).toHaveCount(1);
  await blocker.locator("[data-webguard-recheck]").click();
  await expect(blocker).not.toBeVisible();
  await expect(mode).toBeChecked();
  await expect(page.locator("#runtime-log")).toContainText(
    "페이지 보호 안내 해제",
  );
});

test("demo-only exit disables page protection and cleans up its modal without disabling explicit shortcut restrictions", async ({
  page,
}) => {
  await useUndockedGeometry(page);
  await page.goto("/#live-demo");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
  await page.locator("#runtime-page-block").check();
  await page.locator("#runtime-editor").focus();
  await page.keyboard.press("Meta+Alt+KeyI");
  const blocker = page.locator("dialog[data-webguard-blocker]");
  await expect(blocker).toBeVisible();
  await blocker
    .getByRole("button", { name: "이 데모의 보호 모드 끄기", exact: true })
    .click();
  await expect(page.locator("#runtime-page-block")).not.toBeChecked();
  await expect(blocker).toHaveCount(0);
  await expect(page.locator("#shortcuts")).toBeEnabled();
  await expect(page.locator("#shortcuts")).toBeChecked();
  await expect(page.locator("#runtime-detect")).toBeEnabled();
  await expect(page.locator("#runtime-config")).toContainText(
    '"shortcutScope": "non-editable"',
  );
  await expect(page.locator("#runtime-config")).toContainText(
    '"response": "monitor"',
  );
  await page.locator("#runtime-editor").focus();
  await observeNextInput(page, "keydown", "KeyI");
  await page.keyboard.press("Meta+Alt+KeyI");
  await expect
    .poll(() => inputObservation(page))
    .toEqual({ trusted: true, prevented: false });
  await expect(blocker).toHaveCount(0);
});

test("simulated docked-window geometry opens the page dialog and recheck waits for the signal to clear", async ({
  page,
}) => {
  await useUndockedGeometry(page);
  await page.goto("/#live-demo");
  await page.locator("#runtime-page-block").check();
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-events > summary").click();
  await page.locator("#runtime-detect").check();
  // An explicit fixture for the heuristic, not an opened browser DevTools window.
  await page.evaluate(() => {
    Object.defineProperty(window, "outerWidth", {
      configurable: true,
      get: () => window.innerWidth + 240,
    });
    window.dispatchEvent(new Event("resize"));
  });
  const blocker = page.locator("dialog[data-webguard-blocker]");
  await expect(blocker).toBeVisible();
  await expect(blocker).toHaveAccessibleName(
    "창 크기 변화 신호를 확인해 주세요",
  );
  await expect(
    blocker.getByRole("heading", {
      name: "창 크기 변화 신호를 확인해 주세요",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    blocker.getByRole("button", { name: "창 크기 다시 확인", exact: true }),
  ).toBeVisible();
  await expect(blocker).not.toContainText("개발자도구를 닫아 주세요");
  await blocker.locator("[data-webguard-recheck]").click();
  await expect(blocker).toBeVisible();
  await expect(blocker.locator("[data-demo-block-exit]")).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(window, "outerWidth", {
      configurable: true,
      get: () => window.innerWidth,
    });
    window.dispatchEvent(new Event("resize"));
  });
  await expect(blocker).not.toBeVisible();
  await page.locator("#runtime-page-block").uncheck();
  await expect(blocker).toHaveCount(0);
});

test("default protection switches remain independent and repeatable with real input", async ({
  page,
}) => {
  await useUndockedGeometry(page);
  await page.goto("/#live-demo");
  const mode = page.locator("#runtime-page-block");
  const shortcuts = page.locator("#shortcuts");
  const context = page.locator("#context");
  const target = page.locator("#runtime-target");
  await expect(shortcuts).toBeEnabled();
  for (const enabled of [false, true, false, true]) {
    await shortcuts.setChecked(enabled);
    await expect(mode).toBeChecked();
    await expect(context).toBeChecked();
    await page.locator("#test-f12").click();
    await expect(page.locator("#live-result")).toContainText(
      enabled ? "차단됨" : "허용됨",
    );
    const blocker = page.locator("dialog[data-webguard-blocker]");
    if (enabled) {
      await expect(blocker).toBeVisible();
      await blocker.locator("[data-webguard-recheck]").click();
    }
    await target.focus();
    await observeNextInput(page, "keydown", "KeyI");
    await page.keyboard.press("Meta+Alt+KeyI");
    await expect
      .poll(() => inputObservation(page))
      .toEqual({ trusted: true, prevented: enabled });
    if (enabled) {
      await expect(blocker).toBeVisible();
      await blocker.locator("[data-webguard-recheck]").click();
    }
    await expect(page.locator("#site-protection-summary")).toContainText(
      `검사 단축키 ${enabled ? "ON" : "OFF"}`,
    );
  }
  await context.uncheck();
  await expect(shortcuts).toBeChecked();
  await target.focus();
  await observeNextInput(page, "contextmenu");
  await target.click({ button: "right" });
  await expect
    .poll(() => inputObservation(page))
    .toEqual({ trusted: true, prevented: false });
});

test("invalid advanced threshold preserves actual threshold without blocking basic toggles", async ({
  page,
}) => {
  await useUndockedGeometry(page);
  await page.goto("/#live-demo");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-threshold").fill("5");
  await page.locator("#context").uncheck();
  await expect(page.locator("#runtime-config-error")).toContainText(
    "실제 기준 160px을 유지",
  );
  await expect(page.locator("#runtime-threshold")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("#runtime-config")).toContainText(
    '"threshold": 160',
  );
  await expect(page.locator("#site-protection-summary")).toContainText(
    "본문 우클릭 OFF",
  );
  await page.locator("#shortcuts").uncheck();
  await page.locator("#test-mac-inspect").click();
  await expect(page.locator("#live-result")).toContainText("허용됨");
  await page.locator("#runtime-page-block").uncheck();
  await expect(page.locator("#runtime-config")).toContainText(
    '"response": "monitor"',
  );
  await page.locator("#runtime-threshold").fill("200");
  await page.locator("#runtime-threshold").blur();
  await expect(page.locator("#runtime-config-error")).toBeEmpty();
  await expect(page.locator("#runtime-config")).toContainText(
    '"threshold": 200',
  );
});
