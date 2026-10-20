import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import ts from "typescript";
const probes = [
  "/src/main.ts",
  "/package.json",
  "/.env",
  "/vite.config.ts",
  "/webguard-report.json",
];
const fixturePath = "/assets/resource-fixture.js";
async function fixture(page: Page) {
  const source = await readFile("apps/playground/src/resource-demo.ts", "utf8");
  const code =
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText +
    '\ndocument.body.insertAdjacentHTML("beforeend",resourceMarkup);initResources();';
  const integrity =
    "sha384-" + createHash("sha384").update(code).digest("base64");
  await page.route("**/resources-fixture.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><script type="module" src="${fixturePath}" integrity="${integrity}"></script></head><body></body></html>`,
    }),
  );
  await page.route("**/assets/resource-fixture.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: code }),
  );
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (probes.includes(path) || path === fixturePath + ".map")
      await route.fulfill({ status: 404, body: "" });
    else await route.fallback();
  });
  await page.goto("/resources-fixture.html");
  await expect(page.locator("#resource-audit")).toBeVisible();
  return integrity;
}
test("audits actual deployed source URLs and matches the document entry SRI against fetched bytes", async ({
  page,
  browserName,
}) => {
  const responses: string[] = [];
  page.on("response", (response) =>
    responses.push(new URL(response.url()).pathname),
  );
  await page.goto("/");
  const script = page.locator('script[type="module"][src]').first();
  await expect(script).toHaveAttribute(
    "integrity",
    /^sha384-[A-Za-z0-9+/]{64}$/,
  );
  const entry = new URL((await script.getAttribute("src")) ?? "", page.url())
    .pathname;
  await page.locator("#resource-audit").click();
  await expect(page.locator("#resource-summary")).toHaveAttribute(
    "data-result",
    "pass",
  );
  for (const path of [...probes, entry + ".map"]) {
    await expect(page.locator(`[data-resource-path="${path}"]`)).toContainText(
      "HTTP 404",
    );
    expect(responses).toContain(path);
  }
  await expect(page.locator("#resource-results")).toContainText("SHA-384 일치");
  await expect(page.locator("#resource-exposure")).toContainText("JS와 CSS");
  if (process.env.WEBGUARD_PUBLIC_URL && browserName === "chromium")
    await page
      .locator("#resource-exposure")
      .screenshot({ path: "docs/evidence/resource-guards.png" });
});
test("does not report success for exposed source, SPA fallback or 410 responses", async ({
  page,
}) => {
  await fixture(page);
  for (const [path, status] of [
    ["/src/main.ts", 200],
    ["/.env", 410],
  ] as const)
    await page.route(`**${path}`, (route) =>
      route.fulfill({ status, body: "SENSITIVE_FIXTURE_CONTENT" }),
    );
  await page.locator("#resource-audit").click();
  await expect(page.locator("#resource-summary")).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(
    page.locator('[data-resource-path="/src/main.ts"]'),
  ).toContainText("HTTP 200");
  await expect(page.locator('[data-resource-path="/.env"]')).toContainText(
    "HTTP 410",
  );
  await expect(page.locator("#resource-results")).not.toContainText(
    "SENSITIVE_FIXTURE_CONTENT",
  );
});
test("detects changed asset bytes using the unchanged document SRI and prevents concurrent runs", async ({
  page,
}) => {
  await fixture(page);
  let assetRequests = 0;
  await page.route("**/assets/resource-fixture.js", async (route) => {
    assetRequests++;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      contentType: "application/javascript",
      body: "/* changed after page startup */",
    });
  });
  await page.locator("#resource-audit").click();
  await expect(page.locator("#resource-audit")).toBeDisabled();
  await page.locator("#resource-audit").dispatchEvent("click");
  await expect(page.locator("#resource-summary")).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(page.locator("#resource-results")).toContainText(
    "SHA-384 불일치",
  );
  expect(assetRequests).toBe(1);
  await expect(page.locator("#resource-audit")).toBeEnabled();
});
test("rejects missing SRI and an entry outside the same-origin assets prefix", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() =>
    document
      .querySelector('script[type="module"]')!
      .removeAttribute("integrity"),
  );
  await page.locator("#resource-audit").click();
  await expect(page.locator("#resource-summary")).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(page.locator("#resource-results")).toContainText("SRI");
  await page.evaluate(() =>
    document
      .querySelector('script[type="module"]')!
      .setAttribute("src", "https://resource-fixture.invalid/assets/main.js"),
  );
  const external: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("resource-fixture.invalid"))
      external.push(req.url());
  });
  await page.locator("#resource-audit").click();
  await expect(page.locator("#resource-summary")).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(page.locator("#resource-results")).toContainText("허용");
  expect(external).toEqual([]);
});

test("preserves resource auditing across persisted page lifecycle events and releases a cancelled run", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  await page.route("**/src/main.ts", async (route) => {
    if (first) {
      first = false;
      await delayed;
    }
    await route.fulfill({ status: 404, body: "" }).catch(() => {});
  });
  await page.locator("#resource-audit").click();
  await expect(page.locator("#resource-audit")).toBeDisabled();
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  release();
  await expect(page.locator("#resource-audit")).toBeEnabled();
  await page.locator("#resource-audit").click();
  await expect(page.locator("#resource-summary")).toHaveAttribute(
    "data-result",
    "pass",
  );
  await expect(page.locator("#resource-results li")).toHaveCount(7);
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await page.locator("#resource-audit").click();
  await expect(page.locator("#resource-summary")).toHaveAttribute(
    "data-result",
    "pass",
  );
});
