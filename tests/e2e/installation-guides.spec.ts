import { expect, test } from "@playwright/test";

const routes = [
  ["Vite · React / Vue", "VITE"],
  ["Next.js", "NEXT"],
  ["Webpack · esbuild", "STATIC"],
  ["HTML · jQuery", "HTML"],
  ["Java · JSP / Servlet", "JAVA"],
  ["Python · WSGI", "PYTHON"],
  ["PHP", "PHP"],
  ["CDN · 직접 다운로드", "CDN"],
] as const;

test("installation starts with an environment choice before downloads and details", async ({
  page,
}) => {
  await page.goto("/docs/#install");
  const chooser = page.locator("#install");
  await expect(
    chooser.getByRole("heading", { name: "사용하는 환경을 선택하세요" }),
  ).toBeVisible();
  for (const [label, route] of routes) {
    await expect(
      chooser.getByRole("link", { name: label, exact: false }),
    ).toHaveAttribute("href", `/docs/START_${route}.ko.html`);
  }
  expect(
    await page.evaluate(() =>
      Boolean(
        document
          .querySelector("#install")!
          .compareDocumentPosition(document.querySelector("#sdk-downloads")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const link of await chooser.locator(".installation-choice").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

for (const [label, route] of routes) {
  test(`${route} opens its own step-by-step guide from the chooser`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/docs/#install");
    await page
      .locator("#install")
      .getByRole("link", { name: label, exact: false })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/docs/START_${route}\\.ko\\.html$`),
    );
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForLoadState("load");
    expect(
      (await page.locator(".docs-outline").boundingBox())!.height,
    ).toBeLessThan(180);
    await expect(page.locator("h1")).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page
        .locator("h2")
        .filter({ hasText: /1[.) ]/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator("h2")
        .filter({ hasText: /2[.) ]/ })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "환경 선택으로 돌아가기", exact: true }),
    ).toBeVisible();
  });
}

test("existing direct install-code links reveal the detailed reference", async ({
  page,
}) => {
  await page.goto("/docs/#docs-install");
  await expect(page.locator("#docs-install")).toBeVisible();
  await expect(page.locator(".installation-reference")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator("#docs-install")).toBeInViewport();
});

test("keeps the requested section below the header after a delayed download catalog expands", async ({
  page,
}) => {
  await page.route("**/downloads/catalog.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto("/docs/#configure");
  await expect(page.locator("[data-download-ready]")).toBeVisible();
  await expect
    .poll(async () => (await page.locator("#configure").boundingBox())!.y)
    .toBeLessThan(180);
  await expect(
    page.locator('.docs-outline [aria-current="location"]'),
  ).toHaveAttribute("href", "#configure");
});

test("does not pull the reader back after they scroll during catalog loading", async ({
  page,
}) => {
  let releaseCatalog!: () => void;
  const catalogGate = new Promise<void>((resolve) => {
    releaseCatalog = resolve;
  });
  await page.route("**/downloads/catalog.json", async (route) => {
    await catalogGate;
    await route.continue();
  });
  try {
    await page.goto("/docs/#configure");
    await page.mouse.wheel(0, -800);
    await expect
      .poll(async () => (await page.locator("#configure").boundingBox())!.y)
      .toBeGreaterThan(300);
    releaseCatalog();
    await expect(page.locator("[data-download-ready]")).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect((await page.locator("#configure").boundingBox())!.y).toBeGreaterThan(
      300,
    );
  } finally {
    releaseCatalog();
  }
});

test("does not request an application scroll after reader input before page load", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      const root = document.documentElement;
      if (root.dataset.readerScrolled === "true")
        root.dataset.readerAutoScrolls = String(
          Number(root.dataset.readerAutoScrolls ?? 0) + 1,
        );
      return original.call(this, options);
    };
  });
  let releaseLogo!: () => void;
  const logoGate = new Promise<void>((resolve) => {
    releaseLogo = resolve;
  });
  await page.route("**/docs/favicon.svg", async (route) => {
    await logoGate;
    await route.continue();
  });
  try {
    await page.goto("/docs/#configure", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-download-ready]")).toBeVisible();
    expect(await page.evaluate(() => document.readyState)).toBe("interactive");
    await page.evaluate(() => {
      window.addEventListener(
        "wheel",
        () => {
          document.documentElement.dataset.readerScrolled = "true";
          document.documentElement.dataset.readerAutoScrolls = "0";
        },
        { once: true },
      );
    });
    await page.mouse.wheel(0, -800);
    await expect(page.locator("html")).toHaveAttribute(
      "data-reader-scrolled",
      "true",
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    releaseLogo();
    await page.waitForLoadState("load");
    await expect(page.locator("[data-download-ready]")).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    // Isolate application scroll requests from the browser's own fragment
    // handling during load. The preceding test checks actual catalog layout.
    await expect(page.locator("html")).toHaveAttribute(
      "data-reader-auto-scrolls",
      "0",
    );
  } finally {
    releaseLogo();
  }
});
