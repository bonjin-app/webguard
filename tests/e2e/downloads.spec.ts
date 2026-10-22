import { expect, test } from "@playwright/test";
import { parseDownloadCatalog } from "../../apps/downloads";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

for (const path of ["/demo", "/docs/"]) {
  test(`${path} shows retained SDK downloads and exact CDN SRI`, async ({
    page,
    request,
  }) => {
    const response = await request.get("/downloads/catalog.json");
    expect(response.status()).toBe(200);
    const release = parseDownloadCatalog(await response.json());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${path}#sdk-downloads`);
    const section = page.locator("#sdk-downloads");
    await expect(section.locator("[data-download-status]")).toContainText(
      "다운로드 준비 완료",
    );
    await expect(
      section.getByRole("link", { name: "SDK 파일 다운로드", exact: true }),
    ).toHaveAttribute("href", release.sdk.download);
    await expect(
      section.getByRole("link", { name: "로컬 패키지 .tgz 다운로드" }),
    ).toHaveAttribute("href", release.package.url);
    const downloadEvent = page.waitForEvent("download");
    await section
      .getByRole("link", { name: "SDK 파일 다운로드", exact: true })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe("webguard.global.js");
    const saved = await download.path();
    expect(saved).not.toBeNull();
    expect(
      createHash("sha256")
        .update(await readFile(saved!))
        .digest("hex"),
    ).toBe(release.sdk.sha256);
    await section
      .getByText("고정 CDN 주소로 SDK 연결하기", { exact: true })
      .click();
    await expect(section.locator("[data-cdn-code]")).toContainText(
      `integrity="${release.sdk.integrity}" crossorigin="anonymous"`,
    );
    await expect(section.locator("[data-cdn-code]")).toContainText(
      `https://webguard.uulab.co.kr${release.sdk.url}`,
    );
    await expect(section.locator("[data-cdn-code]")).toContainText(
      '<script defer src="/assets/webguard-init.js"></script>',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("download catalog failure is explicit and retry restores safe links", async ({
  page,
  request,
}) => {
  const response = await request.get("/downloads/catalog.json");
  const catalog = await response.json();
  let fail = true;
  await page.route("**/downloads/catalog.json", async (route) => {
    await route.fulfill(
      fail ? { status: 503, body: "unavailable" } : { json: catalog },
    );
  });
  await page.goto("/docs/#sdk-downloads");
  const section = page.locator("#sdk-downloads");
  await expect(section.locator("[data-download-status]")).toContainText(
    "목록을 불러올 수 없습니다",
  );
  await expect(
    section.getByRole("link", { name: "SDK 파일 다운로드", exact: true }),
  ).toBeHidden();
  fail = false;
  await section.getByRole("button", { name: "목록 다시 불러오기" }).click();
  await expect(
    section.getByRole("link", { name: "SDK 파일 다운로드", exact: true }),
  ).toBeVisible();
});
