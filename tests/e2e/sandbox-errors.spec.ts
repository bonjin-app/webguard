import { expect, test } from "@playwright/test";

test("reports empty thrown values as execution failures instead of matching outputs", async ({
  page,
}) => {
  await page.goto("/#try-examples");
  for (const code of ["throw new Error('');", "throw '';"]) {
    await page.getByLabel("원본 JavaScript", { exact: true }).fill(code);
    await page.getByRole("button", { name: "난독화하고 비교하기" }).click();
    await expect(page.locator("#equivalence")).toHaveText("실행 오류");
    await expect(page.locator("#logs")).toContainText(
      "Sandbox execution failed",
    );
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "난독화하고 비교하기" }),
    ).toBeEnabled();
  }
});
