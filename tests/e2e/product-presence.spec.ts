import { expect, test } from "@playwright/test";

const origin = "https://webguard.uulab.co.kr";

test("serves complete social metadata and genuine PNG previews without running JavaScript", async ({
  browser,
  baseURL,
  request,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  try {
    for (const [path, canonical, image] of [
      ["/", "/", "/og-demo.png"],
      ["/demo", "/demo", "/og-demo.png"],
      ["/docs/", "/docs/", "/docs/og-docs.png"],
    ]) {
      const response = await page.goto(path!);
      expect(response?.ok()).toBe(true);
      const html = await response!.text();
      // Metadata must be present in the HTTP document, not added by the SDK/app.
      expect(html).toContain('property="og:title"');
      expect(html).toContain('name="twitter:card"');
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        origin + canonical,
      );
      for (const [property, value] of [
        ["og:type", "website"],
        ["og:site_name", "WebGuard"],
        ["og:locale", "ko_KR"],
        ["og:url", origin + canonical],
        ["og:image", origin + image],
        ["og:image:secure_url", origin + image],
        ["og:image:type", "image/png"],
        ["og:image:width", "1200"],
        ["og:image:height", "630"],
      ]) {
        const tag = page.locator(`meta[property="${property}"]`);
        await expect(tag).toHaveCount(1);
        await expect(tag).toHaveAttribute("content", value!);
      }
      const title = await page.title();
      expect(title).toContain("WebGuard");
      expect(title).not.toContain("uulab-webguard");
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        "content",
        title,
      );
      await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
        "content",
        title,
      );
      const description = await page
        .locator('meta[name="description"]')
        .getAttribute("content");
      expect(description!.length).toBeGreaterThan(40);
      await expect(
        page.locator('meta[property="og:description"]'),
      ).toHaveAttribute("content", description!);
      await expect(
        page.locator('meta[name="twitter:description"]'),
      ).toHaveAttribute("content", description!);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        "content",
        "summary_large_image",
      );
      await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
        "content",
        origin + image,
      );
      expect(
        await page
          .locator('meta[property="og:image:alt"]')
          .getAttribute("content"),
      ).toBeTruthy();
      const graph = JSON.parse(
        (await page
          .locator('script[type="application/ld+json"]')
          .textContent())!,
      );
      expect(graph["@context"]).toBe("https://schema.org");
      expect(graph["@graph"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            "@type": "SoftwareApplication",
            name: "WebGuard",
            url: origin + "/",
          }),
        ]),
      );
      await expect(page.locator("#app")).toBeEmpty();
      const preview = await request.get(image!);
      expect(preview.status()).toBe(200);
      expect(preview.headers()["content-type"]).toContain("image/png");
      const bytes = await preview.body();
      expect([...bytes.subarray(0, 8)]).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]);
      expect(bytes.readUInt32BE(16)).toBe(1200);
      expect(bytes.readUInt32BE(20)).toBe(630);
      expect(bytes.length).toBeGreaterThan(10000);
    }
  } finally {
    await context.close();
  }
});

test("connects SDK strengths to real interactive panels and keeps product scope readable on mobile", async ({
  page,
}) => {
  await page.goto("/#sdk-strengths");
  await expect(page.locator("#sdk-strengths")).toBeVisible();
  for (const [link, target, tab] of [
    ["원본·난독화 결과 비교", "#try-examples", "코드 난독화"],
    ["실제 정책의 보호 전후 비교", "#policy-lab", "고급 검사"],
    ["이 페이지의 가드 켜고 끄기", "#live-demo", "브라우저 가드"],
    ["SDK 파일 검사 체험하기", "#sdk-file", "파일 검사"],
  ]) {
    await page
      .locator("#sdk-strengths")
      .getByRole("link", { name: link })
      .click();
    await expect(page.locator(target!)).toBeVisible();
    await expect(
      page.getByRole("tab", { name: tab, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  }
  await page.goto("/#sdk-faq");
  await page.locator("#sdk-faq details").nth(1).locator("summary").click();
  await expect(page.locator("#sdk-faq")).toContainText(
    "개발자도구 창을 금지·강제 종료",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/#sdk-strengths",
    "/#sdk-faq",
    "/docs/#security-strengths",
    "/docs/#integration-scope",
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.locator("#integration-scope")).toContainText(
    "checkIntegrity",
  );
  await expect(page.locator("#integration-scope")).toContainText(
    "패키지 기본 OFF",
  );
});

test("the SDK landing exposes actionable documentation and fits compact and desktop screens", async ({
  page,
}) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page).toHaveURL(new URL("/", page.url()).href);
    await expect(page.locator("#hero-heading")).toBeInViewport();
    await expect(page.locator("#hero-heading")).toContainText("빌드");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const heroImage = page.locator(".hero-visual img");
    await expect(heroImage).toBeVisible();
    expect(
      await heroImage.evaluate(
        (node) => (node as HTMLImageElement).naturalWidth,
      ),
    ).toBeGreaterThan(0);
  }
  const resources = page.locator("#developer-resources");
  for (const file of ["INSTALL", "ENVIRONMENTS", "API"]) {
    await expect(
      resources.locator(`a[href="/docs/${file}.ko.html"]`),
    ).toBeVisible();
  }
  await resources.getByRole("link", { name: /함수와 옵션 명세/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "WebGuard API 명세",
  );
});
