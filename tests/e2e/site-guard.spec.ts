import { expect, test, type Page } from "@playwright/test";

interface ObservedInput {
  trusted: boolean;
  prevented: boolean;
}

async function observeInput(page: Page, type: "keydown" | "contextmenu") {
  await page.evaluate((eventType) => {
    const state = window as typeof window & {
      __siteGuardInput?: ObservedInput;
    };
    delete state.__siteGuardInput;
    const observe = (event: Event) => {
      if (event instanceof KeyboardEvent && event.code !== "KeyI") return;
      document.removeEventListener(eventType, observe);
      queueMicrotask(() => {
        state.__siteGuardInput = {
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
        };
      });
    };
    document.addEventListener(eventType, observe);
  }, type);
}

async function observedInput(page: Page) {
  return page.evaluate(
    () =>
      (window as typeof window & { __siteGuardInput?: ObservedInput })
        .__siteGuardInput,
  );
}

test("the site starts protected outside the demo test area and offers a modal-only exit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#runtime-page-block")).toBeChecked();
  await expect(page.locator("#shortcuts")).toBeChecked();
  await expect(page.locator("#shortcuts")).toBeEnabled();
  await expect(page.locator("#context")).toBeChecked();
  await expect(page.locator("#site-protection-status")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "이 페이지의 보호 설정", exact: true }),
  ).toHaveAttribute("href", "#live-demo");

  // A real browser event on the hero proves the SDK applies to this application,
  // rather than only to the illustrated runtime test target.
  await page.locator("#hero-heading").click();
  await observeInput(page, "keydown");
  await page.keyboard.press("Meta+Alt+KeyI");
  await expect
    .poll(() => observedInput(page))
    .toEqual({ trusted: true, prevented: true });
  const blocker = page.locator("dialog[data-webguard-blocker]");
  await expect(blocker).toBeVisible();
  expect(await blocker.evaluate((node) => node.matches(":modal"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(blocker).toBeVisible();
  await blocker.locator("[data-demo-block-exit]").click();
  await expect(blocker).toHaveCount(0);
  await expect(page.locator("#runtime-page-block")).not.toBeChecked();
  await expect(page.locator("#shortcuts")).toBeChecked();
});

test("the default context policy cancels a trusted right click on the hero", async ({
  page,
}) => {
  await page.goto("/");
  await observeInput(page, "contextmenu");
  await page.locator("#hero-heading").click({ button: "right" });
  await expect
    .poll(() => observedInput(page))
    .toEqual({ trusted: true, prevented: true });
  await expect(page.locator("dialog[data-webguard-blocker]")).toHaveCount(0);
});

test("large window dimensions do not lock the site while heuristic detection is disabled", async ({
  page,
}) => {
  // Simulated window dimensions are not evidence of actual DevTools detection.
  await page.addInitScript(() => {
    Object.defineProperty(window, "outerWidth", {
      configurable: true,
      get: () => innerWidth + 800,
    });
    Object.defineProperty(window, "outerHeight", {
      configurable: true,
      get: () => innerHeight + 600,
    });
  });
  await page.goto("/#live-demo");
  await expect(page.locator("#runtime-page-block")).toBeChecked();
  await page.locator("#runtime-advanced > summary").click();
  await expect(page.locator("#runtime-detect")).not.toBeChecked();
  await expect(page.locator("#runtime-detect")).toBeEnabled();
  await expect(page.locator("#runtime-config")).toContainText(
    '"detect": false',
  );
  await expect(page.locator("dialog[data-webguard-blocker]")).toHaveCount(0);
  await page.locator("#runtime-detect").check();
  await expect(page.locator("dialog[data-webguard-blocker]")).toBeVisible();
  await page.locator("[data-demo-block-exit]").click();
  await expect(page.locator("dialog[data-webguard-blocker]")).toHaveCount(0);
});

test("turning off the live policy removes the auto runtime restrictions without a second hidden guard", async ({
  page,
}) => {
  await page.goto("/#live-demo");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-disable").click();
  await expect(page.locator("#runtime-page-block")).not.toBeChecked();
  await expect(page.locator("#shortcuts")).not.toBeChecked();
  await expect(page.locator("#context")).not.toBeChecked();
  await page.locator("#hero-heading").click();
  await observeInput(page, "keydown");
  await page.keyboard.press("Meta+Alt+KeyI");
  await expect
    .poll(() => observedInput(page))
    .toEqual({ trusted: true, prevented: false });
  await expect(page.locator("dialog[data-webguard-blocker]")).toHaveCount(0);
  await observeInput(page, "contextmenu");
  await page.locator("#hero-heading").click({ button: "right" });
  await expect
    .poll(() => observedInput(page))
    .toEqual({ trusted: true, prevented: false });
});

test("restoring site defaults updates the active SDK and all visible controls", async ({
  page,
}) => {
  await page.goto("/#live-demo");
  await page.locator("#runtime-advanced > summary").click();
  await page.locator("#runtime-disable").click();
  await page.locator("#runtime-detect").check();
  await page.locator("#runtime-warn").check();
  await page.locator("#sdk-integrity").uncheck();
  await page.locator("#runtime-threshold").fill("240");
  await page.locator("#runtime-threshold").press("Tab");
  await page.locator("#runtime-defaults").click();
  await expect(page.locator("#runtime-page-block")).toBeChecked();
  await expect(page.locator("#shortcuts")).toBeChecked();
  await expect(page.locator("#context")).toBeChecked();
  await expect(page.locator("#runtime-detect")).not.toBeChecked();
  await expect(page.locator("#runtime-warn")).not.toBeChecked();
  await expect(page.locator("#sdk-integrity")).toBeChecked();
  await expect(page.locator("#runtime-threshold")).toHaveValue("160");
  await expect(page.locator("#site-protection-summary")).toContainText(
    "페이지 보호 ON",
  );
  await page.locator("#runtime-editor").focus();
  await observeInput(page, "keydown");
  await page.keyboard.press("Meta+Alt+KeyI");
  await expect
    .poll(() => observedInput(page))
    .toEqual({ trusted: true, prevented: true });
  await expect(page.locator("dialog[data-webguard-blocker]")).toBeVisible();
});
