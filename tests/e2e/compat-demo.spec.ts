import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createServer, type Server } from "node:http";
const fixtures: Server[] = [];
test.afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
const base = "/examples/vanilla-js/about/";
const policy =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'";
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>한글 보안 체험</title><link rel="stylesheet" href="../assets/about.css"></head><body><h1>한글 보안 체험</h1></body></html>`;
async function fixture(page: Page, options: { redirectQuery?: string } = {}) {
  const source = await readFile("apps/playground/src/compat-demo.ts", "utf8");
  const module =
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText +
    '\ndocument.body.insertAdjacentHTML("beforeend",compatMarkup);initCompatDemo();';
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/compat-fixture.html") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(
        '<!doctype html><script type="module" src="/assets/compat-fixture.js"></script>',
      );
      return;
    }
    if (url.pathname === "/assets/compat-fixture.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end(module);
      return;
    }
    if (url.pathname === base) {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Content-Security-Policy", policy);
      response.end(html);
      return;
    }
    if (url.pathname === base.slice(0, -1)) {
      response.statusCode = 308;
      response.setHeader(
        "Location",
        base + (options.redirectQuery ?? url.search),
      );
      response.end();
      return;
    }
    if (url.pathname === "/api/demo/network-probe") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ probe: "webguard-network-ok" }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  fixtures.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  await page.goto(`http://127.0.0.1:${address.port}/compat-fixture.html`);
  await expect(page.locator("#compat-run")).toBeVisible();
  return `http://127.0.0.1:${address.port}`;
}
test("checks the real multipage, charset, headers, query redirect and fixed API over HTTP", async ({
  page,
  request,
  browserName,
}) => {
  const redirect = await request.get(base.slice(0, -1) + "?view=demo", {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe(base + "?view=demo");
  await page.goto("/");
  await expect(page.locator("#compatibility-lab")).toContainText(
    "한글 페이지가 올바른 보안 정책과 함께 전달되는지 확인합니다.",
  );
  await page.locator("#compat-run").click();
  await expect(page.locator("#compat-summary")).toHaveAttribute(
    "data-result",
    "pass",
  );
  await expect(page.locator("#compat-results")).toContainText("한글 보안 체험");
  await expect(page.locator("#compat-results")).toContainText(
    "HTTP API 연결 확인",
  );
  await expect(page.locator("#compat-results")).toContainText(
    "최종주소·쿼리 유지 확인",
  );
  await expect(page.locator("#compat-results")).not.toContainText(
    "프록시 검증 완료",
  );
  await expect(
    page.getByRole("link", { name: "하위 페이지 직접 열기", exact: true }),
  ).toHaveAttribute("href", base);
  await expect(
    page.getByRole("link", { name: "하위 페이지 직접 열기", exact: true }),
  ).toHaveAttribute("rel", "noopener");
  if (process.env.WEBGUARD_PUBLIC_URL && browserName === "chromium")
    await page
      .locator("#compatibility-lab")
      .screenshot({ path: "docs/evidence/deployment-compatibility.png" });
});
test("renders actual responses and completes a valid fixture", async ({
  page,
}) => {
  await fixture(page);
  await page.locator("#compat-run").click();
  await page.waitForFunction(() =>
    ["pass", "fail"].includes(
      document.querySelector<HTMLElement>("#compat-summary")!.dataset.result ??
        "",
    ),
  );
  await expect(page.locator("#compat-summary")).toHaveAttribute(
    "data-result",
    "pass",
  );
  await expect(page.locator("#compat-results li")).toHaveCount(6);
});
test("does not count HTTP/API failures or a successful SPA fallback as compatibility success", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/demo/network-probe", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ probe: "webguard-network-ok" }),
    }),
  );
  await page.route("**/about/not-a-static-page/", (route) =>
    route.fulfill({ status: 200, body: html }),
  );
  await page.locator("#compat-run").click();
  await expect(page.locator("#compat-summary")).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(page.locator('[data-compat-check="api"]')).toContainText(
    "HTTP 503",
  );
  await expect(page.locator('[data-compat-check="missing"]')).toContainText(
    "HTTP 200",
  );
});
for (const { name, body } of [
  {
    name: "charset after CSP",
    body: html
      .replace('<meta charset="utf-8">', "")
      .replace("<title>", '<meta charset="utf-8"><title>'),
  },
  {
    name: "charset beyond byte 1024",
    body: html.replace(
      '<meta charset="utf-8">',
      " ".repeat(1100) + '<meta charset="utf-8">',
    ),
  },
  {
    name: "source phrase corrupted",
    body: html.replaceAll("한글 보안 체험", "????"),
  },
  {
    name: "head inserted after body",
    body: html.replace("<head>", "<body><head>"),
  },
  {
    name: "fake commented charset",
    body: html.replace(
      '<meta charset="utf-8">',
      '<!-- <meta charset="utf-8"> -->',
    ),
  },
])
  test(`rejects ${name} instead of showing a false success`, async ({
    page,
  }) => {
    await fixture(page);
    await page.route("**/examples/vanilla-js/about/**", (route) => {
      if (new URL(route.request().url()).pathname !== base)
        return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: { "Content-Security-Policy": policy },
        body,
      });
    });
    await page.locator("#compat-run").click();
    await expect(page.locator("#compat-summary")).toHaveAttribute(
      "data-result",
      "fail",
    );
    await expect(
      page.locator(
        `[data-compat-check="${name === "source phrase corrupted" ? "page" : "charset"}"]`,
      ),
    ).toHaveAttribute("data-result", "fail");
    await expect(page.locator('[data-compat-check="missing"]')).toHaveAttribute(
      "data-result",
      "pass",
    );
  });
test("rejects missing enforced headers, wrong API markers and a redirect with a changed query", async ({
  page,
  request,
}) => {
  // WebKit cannot synthesize a redirect through route.fulfill; use a real HTTP response.
  const origin = await fixture(page, { redirectQuery: "?view=wrong" });
  const redirect = await request.get(
    origin + base.slice(0, -1) + "?view=demo",
    { maxRedirects: 0 },
  );
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe(base + "?view=wrong");
  await page.route("**/api/demo/network-probe", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: '{"probe":"wrong"}',
    }),
  );
  await page.route("**/examples/vanilla-js/about/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== base) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      headers: { "Content-Security-Policy-Report-Only": policy },
      body: html,
    });
  });
  await page.locator("#compat-run").click();
  await expect(page.locator("#compat-summary")).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(page.locator('[data-compat-check="policy"]')).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(page.locator('[data-compat-check="redirect"]')).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(page.locator('[data-compat-check="api"]')).toHaveAttribute(
    "data-result",
    "fail",
  );
});
test("keeps retry available after persisted lifecycle cancellation without duplicate runs", async ({
  page,
}) => {
  await fixture(page);
  let count = 0;
  await page.route("**/api/demo/network-probe", async (route) => {
    count++;
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route
      .fulfill({
        contentType: "application/json",
        body: '{"probe":"webguard-network-ok"}',
      })
      .catch(() => {});
  });
  await page.locator("#compat-run").click();
  await expect(page.locator("#compat-run")).toBeDisabled();
  await page.locator("#compat-run").dispatchEvent("click");
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await expect(page.locator("#compat-run")).toBeEnabled();
  await page.locator("#compat-run").click();
  await expect(page.locator("#compat-summary")).toHaveAttribute(
    "data-result",
    "pass",
  );
  expect(count).toBeLessThanOrEqual(2);
  await expect(page.locator("#compat-results li")).toHaveCount(6);
});

test("rejects a MIME value containing text/html without being text/html", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/examples/vanilla-js/about/**", (route) => {
    if (new URL(route.request().url()).pathname !== base)
      return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/text/html; charset=utf-8",
      headers: { "Content-Security-Policy": policy },
      body: html,
    });
  });
  await page.locator("#compat-run").click();
  await expect(page.locator('[data-compat-check="page"]')).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(page.locator("#compat-summary")).toHaveAttribute(
    "data-result",
    "fail",
  );
  await expect(page.locator('[data-compat-check="missing"]')).toHaveAttribute(
    "data-result",
    "pass",
  );
});
