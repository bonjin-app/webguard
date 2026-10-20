import { test, expect } from "@playwright/test";
for (const [name, port] of [
  ["vanilla-js", 4176],
  ["vanilla-ts", 4177],
] as const) {
  test(`${name}: protected build preserves counter, form, dynamic import and opt-in keyboard control`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.locator("#counter").click();
    await expect(page.locator("#counter")).toContainText("1");
    await page.locator("#lazy-load").click();
    await expect(page.locator("#lazy-result")).toContainText("42");
    await page.locator("#message").fill("<strong>safe text</strong>");
    await page.locator("#echo-form button").click();
    await expect(page.locator("#echo-result")).toContainText(
      "<strong>safe text</strong>",
    );
    await expect(page.locator("#echo-result strong")).toHaveCount(0);
    const initial = await page.evaluate(() => {
      const e = new KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(initial).toBe(false);
    await page.locator("#guard-toggle").check();
    const blocked = await page.evaluate(() => {
      const e = new KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(blocked).toBe(true);
    expect(errors).toEqual([]);
  });
}
test("React protected build preserves state, async import, routing, forms and CSP", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto("http://127.0.0.1:4174");
  expect(response!.headers()["content-security-policy"]).toContain(
    "require-trusted-types-for 'script'",
  );
  await expect(page.getByTestId("guard-startup")).toHaveText(
    "Automatic SDK ready before React render",
  );
  await page.getByRole("heading", { level: 1 }).click();
  await page.evaluate(() => {
    document.addEventListener(
      "keydown",
      (event) => {
        Reflect.set(globalThis, "webguardKeyEvidence", {
          key: event.key,
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
        });
      },
      { once: true },
    );
  });
  await page.keyboard.press("F12");
  expect(
    await page.evaluate(() => Reflect.get(globalThis, "webguardKeyEvidence")),
  ).toEqual({ key: "F12", trusted: true, prevented: true });
  const shortcutBlocked = () =>
    page.evaluate(() => {
      const event = new KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await shortcutBlocked()).toBe(true);
  await page.getByLabel("Intercept developer tool shortcuts").uncheck();
  expect(await shortcutBlocked()).toBe(false);
  await page.getByLabel("Intercept developer tool shortcuts").check();
  expect(await shortcutBlocked()).toBe(true);
  const contextBlocked = () =>
    page.evaluate(() => {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await contextBlocked()).toBe(true);
  await page.getByLabel("Intercept context menu", { exact: true }).uncheck();
  expect(await contextBlocked()).toBe(false);
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
  await page.getByRole("button", { name: "Load module" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Lazy module loaded" }),
  ).toHaveText("Lazy module loaded: 42");
  await page.getByLabel("Your name").fill("WebGuard");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Hello, WebGuard")).toBeVisible();
  await page.getByRole("link", { name: "Details", exact: true }).click();
  await expect(page.getByTestId("route")).toContainText("#details");
  expect(errors).toEqual([]);
});
test("documentation renders and protection metadata has no public map files", async ({
  page,
  request,
}) => {
  await page.goto("http://127.0.0.1:4175");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const response = await request.get(
    "http://127.0.0.1:4174/webguard-manifest.json",
  );
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(Object.keys(manifest.files).some((p) => p.endsWith(".map"))).toBe(
    false,
  );
});
