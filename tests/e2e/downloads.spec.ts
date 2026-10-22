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
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            document.documentElement.dataset.copiedInstall = text;
          },
        },
      });
    });
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
    const command = `npm install -D https://webguard.uulab.co.kr${release.package.url}`;
    await expect(section.locator("[data-package-install-code]")).toHaveText(
      command,
    );
    const setupCode = page.locator(
      path === "/demo" ? "#setup-install" : "#docs-install",
    );
    await expect(setupCode).toHaveText(command);
    const manager = section.getByLabel("패키지 설치 도구");
    await expect
      .poll(async () => (await manager.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
    await manager.focus();
    await manager.press("p");
    await manager.press("Tab");
    await expect(manager).toHaveValue("pnpm");
    const selected = command.replace("npm install", "pnpm add");
    await expect(setupCode).toHaveText(selected);
    await section
      .getByRole("button", { name: "설치 명령 복사", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-copied-install",
      selected,
    );
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

test("install command stays disabled while loading and rejects a hostile catalog", async ({
  page,
  request,
}) => {
  const catalog = await (await request.get("/downloads/catalog.json")).json();
  let releaseResponse!: () => void;
  const pending = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/downloads/catalog.json", async (route) => {
    await pending;
    catalog.current.package.url = "https://untrusted.example/evil.tgz";
    await route.fulfill({ json: catalog });
  });
  await page.goto("/docs/#sdk-downloads", { waitUntil: "domcontentloaded" });
  const section = page.locator("#sdk-downloads");
  await expect(
    section.getByRole("button", { name: "설치 명령 복사", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#docs-install")).toHaveText(
    "다운로드 목록을 불러오는 중…",
  );
  releaseResponse();
  await expect(section.locator("[data-download-status]")).toContainText(
    "목록을 불러올 수 없습니다",
  );
  await expect(page.locator("#docs-install")).not.toContainText("https:");
  await expect(
    section.getByRole("button", { name: "설치 명령 복사", exact: true }),
  ).toBeDisabled();
  await expect(section.locator("[data-download-package]")).not.toHaveAttribute(
    "href",
  );
});
